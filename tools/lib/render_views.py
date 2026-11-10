"""Software-render a textured GLB from several angles. usage: render_views.py in.glb out.png"""
import sys
import numpy as np, trimesh
from PIL import Image


def render(V, F, UV, tex, yaw, size=620, zoom=None):
    a = np.radians(yaw)
    R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    P = V @ R.T
    lo, hi = V.min(0), V.max(0)
    c = (lo + hi) / 2
    c = np.array([0, c[1], 0]) + (R @ np.array([c[0], 0, c[2]]) * [1, 0, 1])
    span = (hi - lo).max() * 1.04
    if zoom:
        span *= zoom[0]; c = c + np.array([0, (hi[1] - lo[1]) * zoom[1], 0])
    s = size / span
    X = (P[:, 0] - c[0]) * s + size / 2
    Y = size / 2 - (P[:, 1] - c[1]) * s
    Z = P[:, 2]
    img = np.full((size, size, 3), 235, np.uint8)
    zb = np.full((size, size), -1e9)
    n = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    light = np.clip(n @ (np.array([0.25, 0.35, 0.9]) / 1.0), 0, 1) * 0.55 + 0.75
    T = tex.shape[0]
    for i in np.where(n[:, 2] > 0)[0]:
        f = F[i]
        x, y = X[f], Y[f]
        x0, x1 = int(max(np.floor(x.min()), 0)), int(min(np.ceil(x.max()), size - 1))
        y0, y1 = int(max(np.floor(y.min()), 0)), int(min(np.ceil(y.max()), size - 1))
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(d) < 1e-9:
            continue
        w0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
        w1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
        w2 = 1 - w0 - w1
        m = (w0 >= -.01) & (w1 >= -.01) & (w2 >= -.01)
        if not m.any():
            continue
        z = w0 * Z[f[0]] + w1 * Z[f[1]] + w2 * Z[f[2]]
        px, py = gx[m], gy[m]
        z = z[m]
        vis = z > zb[py, px]
        px, py, z = px[vis], py[vis], z[vis]
        if not len(z):
            continue
        uv = (w0[m][vis, None] * UV[f[0]] + w1[m][vis, None] * UV[f[1]] + w2[m][vis, None] * UV[f[2]])
        tx = np.clip((uv[:, 0] % 1) * T, 0, T - 1).astype(int)
        ty = np.clip((1 - uv[:, 1] % 1) * T, 0, T - 1).astype(int)
        zb[py, px] = z
        img[py, px] = np.clip(tex[ty, tx][:, :3] * light[i], 0, 255)
    return Image.fromarray(img)


if __name__ == "__main__":
    s = trimesh.load(sys.argv[1])
    g = list(s.geometry.values())[0]
    # bake scene transform
    m = s.dump(concatenate=True) if len(s.geometry) > 1 else g.copy()
    if len(s.geometry) == 1:
        node = s.graph.geometry_nodes[list(s.geometry)[0]][0]
        m.apply_transform(s.graph[node][0])
    tex = np.asarray(g.visual.material.baseColorTexture.convert("RGB"))
    V, F, UV = np.asarray(m.vertices), np.asarray(m.faces), np.asarray(g.visual.uv)
    views = [render(V, F, UV, tex, y) for y in (0, 90, 180, 270)]
    views.append(render(V, F, UV, tex, 0, zoom=(.3, .36)))
    W = sum(v.width for v in views)
    o = Image.new("RGB", (W, views[0].height))
    x = 0
    for v in views:
        o.paste(v, (x, 0)); x += v.width
    o.save(sys.argv[2])
    print(len(F), "tris", sys.argv[2])
