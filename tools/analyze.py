"""Find strike moments (end-effector speed peaks) and root travel for each clip."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
import numpy as np
from inspect_rig import acc, load

def qm(q):
    x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def interp(t,T,V):
    i=np.clip(np.searchsorted(T,t)-1,0,len(T)-2); a=T[i];b=T[i+1]; f=0 if b==a else np.clip((t-a)/(b-a),0,1); return V[i]*(1-f)+V[i+1]*f
for f in sorted(pathlib.Path(r"D:\EddieWolfunny\tools\raw").glob(sys.argv[1] if len(sys.argv) > 1 else "batch*.glb")):
    j,b=load(f); nodes=j["nodes"]; par={c:i for i,n in enumerate(nodes) for c in n.get("children",[])}
    name={i:n.get("name") for i,n in enumerate(nodes)}; idx={v:k for k,v in name.items()}
    for a in j["animations"]:
        ch={}
        for c in a["channels"]:
            s=a["samplers"][c["sampler"]]; T=acc(j,b,s["input"]).ravel(); ch[(c["target"]["node"],c["target"]["path"])]=(T-T[0],acc(j,b,s["output"]))
        D=max(v[0][-1] for v in ch.values()); ts=np.arange(0,D,1/60)
        eff=["RightHand","LeftHand","RightFoot","LeftFoot"]; P={e:[] for e in eff}; root=[]
        for t in ts:
            G={}
            def g(i):
                if i in G: return G[i]
                n=nodes[i]; tr=np.array(n.get("translation",[0,0,0]),float); q=np.array(n.get("rotation",[0,0,0,1]),float); sc=np.array(n.get("scale",[1,1,1]),float)
                if (i,"translation") in ch: tr=interp(t,*ch[(i,"translation")])
                if (i,"rotation") in ch: q=interp(t,*ch[(i,"rotation")])
                M=np.eye(4); M[:3,:3]=qm(q/np.linalg.norm(q))*sc; M[:3,3]=tr
                G[i]=g(par[i])@M if i in par else M; return G[i]
            for e in eff: P[e].append(g(idx[e])[:3,3])
            root.append(g(idx["Hips"])[:3,3])
        root=np.array(root); out=[]
        for e in eff:
            p=np.array(P[e]); v=np.linalg.norm(np.diff(p,axis=0),axis=1)*60
            pk=[i for i in range(1,len(v)-1) if v[i]>=v[i-1] and v[i]>=v[i+1] and v[i]>.55*v.max()]
            out.append(f"{e[:2]}{e[-4:]} max{v.max():.1f} pk@" + ",".join(f"{ts[i]/D:.2f}" for i in pk[:6]))
        disp=root[-1]-root[0]
        print(f"{a['name']:28s} {D:.2f}s root dxz=({disp[0]:+.2f},{disp[2]:+.2f}) h={root[:,1].min():.2f}-{root[:,1].max():.2f} | "+" | ".join(out))
