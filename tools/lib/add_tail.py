"""Add a Tail01..05 bone chain under Hips and reskin the tail. usage: add_tail.py in.glb out.glb"""
import heapq, json, struct, sys
import numpy as np
from fix_eyes import read_glb, write_glb
from inspect_rig import acc, COMP, NC

N = 5
FEATHER = 0.07


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab + 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def write_acc(j, chunk, i, arr):
    a = j["accessors"][i]
    v = j["bufferViews"][a["bufferView"]]
    n = NC[a["type"]]
    dt = np.dtype("<" + COMP[a["componentType"]])
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", 0) or dt.itemsize * n
    data = arr.astype(dt)
    for k in range(len(data)):
        chunk[off + k * stride:off + k * stride + dt.itemsize * n] = data[k].tobytes()


def adjacency(F, inv, count):
    adj = [set() for _ in range(count)]
    for a, b, c in inv[F.astype(int)]:
        adj[a] |= {b, c}; adj[b] |= {a, c}; adj[c] |= {a, b}
    return adj


def segment(V, F, names, J, W, bind):
    idx = {n: i for i, n in enumerate(names)}
    # welded vertices so UV seams do not split the graph
    _, first, inv = np.unique(V.round(5), axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    P = V[first]
    adj = adjacency(F, inv, len(P))
    hipy = bind[idx["Hips"]][1, 3]
    # the tail hangs clear of the body in side view: cut it behind the rump.
    # rump depth is measured on the +x side, where the tail never is
    from scipy.spatial import cKDTree
    mirror = cKDTree(P * [-1, 1, 1]).query(P)[0]
    side = (P[:, 0] > .12) & (mirror < .02) & (P[:, 1] > hipy - .4) & (P[:, 1] < hipy + .02)
    zcut = np.percentile(P[side, 2], .5) - .005
    cand = (P[:, 2] < zcut) & (P[:, 1] < hipy + .03)
    # largest connected candidate island
    seen, best = set(), []
    for s in np.where(cand)[0]:
        if s in seen:
            continue
        comp, st = [], [s]
        seen.add(s)
        while st:
            u = st.pop(); comp.append(u)
            for v in adj[u]:
                if cand[v] and v not in seen:
                    seen.add(v); st.append(v)
        if len(comp) > len(best):
            best = comp
    tail = np.zeros(len(P), bool); tail[best] = True
    bnd = [u for u in best if any(not tail[v] for v in adj[u])]
    hip = bind[idx["Hips"]][:3, 3]
    nearest = min(bnd, key=lambda u: np.linalg.norm(P[u] - hip))
    seeds = [u for u in bnd if np.linalg.norm(P[u] - P[nearest]) < .16]
    # geodesic distance from the root ring
    d = {u: 0.0 for u in seeds}
    pq = [(0.0, u) for u in seeds]
    while pq:
        du, u = heapq.heappop(pq)
        if du > d[u]:
            continue
        for v in adj[u]:
            if tail[v]:
                nd = du + np.linalg.norm(P[u] - P[v])
                if nd < d.get(v, 1e9):
                    d[v] = nd; heapq.heappush(pq, (nd, v))
    geo = np.full(len(P), np.nan)
    for u, x in d.items():
        geo[u] = x
    reached = ~np.isnan(geo)
    return P, inv, reached, geo, seeds


def run(src, dst):
    j, chunk = read_glb(src)
    skin = j["skins"][0]
    names = [j["nodes"][n].get("name", str(n)) for n in skin["joints"]]
    if "Tail01" in names:
        sys.exit("already has tail bones")
    IBM = acc(j, chunk, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    bind = np.linalg.inv(IBM)
    prim = j["meshes"][0]["primitives"][0]
    V = acc(j, chunk, prim["attributes"]["POSITION"])
    F = acc(j, chunk, prim["indices"]).reshape(-1, 3).astype(int)
    J = acc(j, chunk, prim["attributes"]["JOINTS_0"]).astype(int)
    wi = prim["attributes"]["WEIGHTS_0"]
    ctype = j["accessors"][wi]["componentType"]
    scale = {5126: 1.0, 5121: 255.0, 5123: 65535.0}[ctype]
    W = acc(j, chunk, wi) / scale

    P, inv, tail, geo, seeds = segment(V, F, names, J, W, bind)
    gmax = np.nanmax(geo)
    tv = np.where(tail)[0]
    t = geo[tv] / gmax
    # joint positions: root ring then centroid of each iso-distance slice
    pts = [P[seeds].mean(0)]
    for i in range(1, N + 1):
        m = abs(t - i / N) < .5 / N if i < N else t > 1 - .5 / N
        pts.append(P[tv[m]].mean(0))
    pts = np.array(pts)

    # new joints: rotation identical to Hips, chained translations
    hips_i = names.index("Hips")
    hips_node = skin["joints"][hips_i]
    parent_ibm, parent_node = IBM[hips_i], j["nodes"][hips_node]
    new_ibm, new_idx = [], []
    for i in range(N):
        l = (parent_ibm @ np.r_[pts[i], 1])[:3]
        T = np.eye(4); T[:3, 3] = -l
        ibm = T @ parent_ibm
        node = {"name": f"Tail{i + 1:02d}", "translation": [float(x) for x in l]}
        j["nodes"].append(node)
        nid = len(j["nodes"]) - 1
        parent_node.setdefault("children", []).append(nid)
        new_ibm.append(ibm); new_idx.append(len(skin["joints"]))
        skin["joints"].append(nid)
        parent_ibm, parent_node = ibm, node

    Jn, Wn = J.copy(), W.copy()
    per = {u: [] for u in range(len(P))}
    for vi, u in enumerate(inv):
        per[u].append(vi)
    for u, tt in zip(tv, t):
        s = tt * N - .5
        b = int(np.floor(s)); f = s - b
        if b < 0:
            js, ws = [hips_i, new_idx[0]], [1 - f, f]
        elif b >= N - 1:
            js, ws = [new_idx[N - 1]], [1.0]
        else:
            js, ws = [new_idx[b], new_idx[b + 1]], [1 - f, f]
        for vi in per[u]:
            Jn[vi] = (js + [0, 0, 0, 0])[:4]
            Wn[vi] = (ws + [0, 0, 0, 0])[:4]
    # feather the skin around the root onto Hips so it does not tear with the leg
    root = P[seeds]
    for u in np.where(~tail)[0]:
        if P[u, 2] > root[:, 2].max() + .1:
            continue
        d = np.min(np.linalg.norm(root - P[u], axis=1))
        if d < FEATHER:
            a = 1 - d / FEATHER
            for vi in per[u]:
                acc_w = {}
                for k, w in zip(Jn[vi], Wn[vi]):
                    acc_w[int(k)] = acc_w.get(int(k), 0) + w * (1 - a)
                acc_w[hips_i] = acc_w.get(hips_i, 0) + a
                top = sorted(acc_w.items(), key=lambda x: -x[1])[:4]
                tot = sum(x[1] for x in top)
                Jn[vi] = ([x[0] for x in top] + [0, 0, 0, 0])[:4]
                Wn[vi] = ([x[1] / tot for x in top] + [0, 0, 0, 0])[:4]

    write_acc(j, chunk, prim["attributes"]["JOINTS_0"], Jn)
    if ctype == 5126:
        write_acc(j, chunk, wi, Wn)
    else:
        q = np.round(Wn * scale).astype(int)
        q[np.arange(len(q)), q.argmax(1)] += int(scale) - q.sum(1)
        write_acc(j, chunk, wi, q)

    # IBM accessor: rewritten and appended
    all_ibm = np.concatenate([IBM, np.array(new_ibm)]).transpose(0, 2, 1).reshape(-1, 16)
    blob = all_ibm.astype("<f4").tobytes()
    chunk += b"\0" * (-len(chunk) % 4)
    off = len(chunk)
    chunk += blob
    j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(blob)})
    j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": 5126,
                           "count": len(all_ibm), "type": "MAT4"})
    skin["inverseBindMatrices"] = len(j["accessors"]) - 1
    j["buffers"][0]["byteLength"] = len(chunk)
    write_glb(dst, j, chunk)
    print(f"{dst}: tail verts {int(tail.sum())}/{len(P)}, length {gmax:.2f} m, joints {len(skin['joints'])}")
    print("  joints at", pts.round(3).tolist())


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
