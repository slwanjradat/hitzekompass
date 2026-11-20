import sys, os, json, base64, zlib, time
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy import ndimage as ndi
from PIL import Image
from load import load, A
import tm

OUT=os.environ.get('HK_OUT','./data'); os.makedirs(OUT+'/img',exist_ok=True)
t0=time.time()
def log(*a): print('[%5.1fs]'%(time.time()-t0),*a,flush=True)

X0,Y0,CELL=556847.5,5784267.5,5.0     # PET frame (UL corner)
H,W=2705,3161
OFF=20                                # structure frame is 20 px larger on each side

# ---------- 1. Web-Mercator target grid ----------
ys=np.linspace(Y0,Y0-H*CELL,60); xs=np.linspace(X0,X0+W*CELL,60)
ee=np.concatenate([xs,xs,np.full(60,X0),np.full(60,X0+W*CELL)]); nn=np.concatenate([np.full(60,Y0),np.full(60,Y0-H*CELL),ys,ys])
la,lo=tm.inverse(ee,nn); mx,my=tm.to3857(la,lo)
PX=14.0
gx0=np.floor(mx.min()/PX)*PX; gx1=np.ceil(mx.max()/PX)*PX; gy0=np.floor(my.min()/PX)*PX; gy1=np.ceil(my.max()/PX)*PX
OW=int(round((gx1-gx0)/PX)); OH=int(round((gy1-gy0)/PX))
log('out grid',OW,OH)
cx=gx0+(np.arange(OW)+0.5)*PX; cy=gy1-(np.arange(OH)+0.5)*PX
CX,CY=np.meshgrid(cx,cy)
LAT,LON=tm.from3857(CX,CY)
E,N=tm.forward(LAT,LON)
SC=(E-X0)/CELL-0.5; SR=(Y0-N)/CELL-0.5         # source col,row (pixel centres)
inside=(SC>=0)&(SC<=W-1)&(SR>=0)&(SR<=H-1)
bounds_ll=[tm.from3857(gx0,gy0), tm.from3857(gx1,gy1)]  # (south,west),(north,east)
log('bounds',bounds_ll)

def warp(arr,order=0,cval=0):
    out=ndi.map_coordinates(arr,[np.clip(SR,0,H-1),np.clip(SC,0,W-1)],order=order,mode='nearest')
    return out,inside

# ---------- 2. Heat layers ----------
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
PET_STOPS=[(17,'#2b6cb0'),(23,'#4aa3c9'),(26,'#8fd19e'),(29,'#d9ec8a'),(32,'#fbe36b'),(35,'#f7b04c'),(38,'#ef7b3a'),(41,'#d9412f'),(44,'#8c1d40')]
T4_STOPS=[(11,'#2b6cb0'),(14,'#4aa3c9'),(16,'#8fd19e'),(17.5,'#fbe36b'),(19,'#f7b04c'),(20.5,'#ef7b3a'),(22,'#d9412f')]
def palette(stops,vmin,vmax,step):
    vals=np.arange(vmin,vmax+step/2,step)
    pal=[(0,0,0)]
    xs=[s[0] for s in stops]; cols=np.array([hexrgb(s[1]) for s in stops],float)
    for v in vals:
        pal.append(tuple(int(round(np.interp(v,xs,cols[:,k]))) for k in range(3)))
    return vals,pal
def save_indexed(idx,pal,path,alphas=None):
    im=Image.fromarray(idx.astype(np.uint8),'P')
    flat=[c for p in pal for c in p]; flat+= [0]*(768-len(flat)); im.putpalette(flat)
    if alphas is None: im.save(path,optimize=True,transparency=0)
    else:
        al=bytes(list(alphas)+[255]*(256-len(alphas))); im.save(path,optimize=True,transparency=al)
    return os.path.getsize(path)

scen={'ist':'ist','p1':'p1','p2':'p2'}
GCELL=4; GH,GW=H//GCELL,W//GCELL       # lookup grid 20 m  (676 x 790)
grids={}; stats={}
def blockmean(a,valid):
    a=a[:GH*GCELL,:GW*GCELL]; v=valid[:GH*GCELL,:GW*GCELL]
    s=(a*v).reshape(GH,GCELL,GW,GCELL).sum((1,3)); c=v.reshape(GH,GCELL,GW,GCELL).sum((1,3))
    return np.where(c>0,s/np.maximum(c,1),np.nan)
def fill_nan_nearest(g):
    m=np.isnan(g); 
    if not m.any(): return g
    idx=ndi.distance_transform_edt(m,return_distances=False,return_indices=True)
    return g[tuple(idx)]
for s in scen:
    pet=load(f'{s}_PET_rev00.tif'); t4=load(f'{s}_t04_rev00.tif')
    for name,arr,stops,vmin,vmax,step,off,scale in (('pet',pet,PET_STOPS,15,47,0.5,10,6),('t04',t4,T4_STOPS,11,22.5,0.25,5,10)):
        valid=arr>-9000
        o,ins=warp(np.where(valid,arr,np.nan).astype('float32'),order=0)
        vals,pal=palette(stops,vmin,vmax,step)
        idx=np.clip(np.round((o-vmin)/step),0,len(vals)-1)+1
        idx[np.isnan(o)|~ins]=0
        sz=save_indexed(idx,pal,f'{OUT}/img/{name}_{s}.png')
        log(name,s,'png',sz//1024,'KB')
        g=blockmean(arr,valid); stats[f'{name}_{s}']=[float(np.nanmin(g)),float(np.nanmean(g)),float(np.nanmax(g))]
        # keep NaN (buildings) as nearest value for lookups
        gq=fill_nan_nearest(g)
        grids[f'{name}_{s}']=np.clip(np.round((gq-off)*scale),1,255).astype(np.uint8)
    if s=='ist': pet_ist=pet

# ---------- 3. Shade (21 July, CEST) ----------
hst=load('Strukturhoehe_Ist.tif')[OFF:OFF+H,OFF:OFF+W]      # aligned to PET frame
hb=np.where(hst>=2.0,hst,0).astype('float32')
LAT0,LON0=52.15,9.95
def sun(hour_cest,doy=202):
    B=np.radians(360/365*(doy-81)); eot=9.87*np.sin(2*B)-7.53*np.cos(B)-1.5*np.sin(B)
    dec=np.radians(23.45*np.sin(np.radians(360/365*(284+doy))))
    solar=(hour_cest-2)+LON0/15+eot/60; Hh=np.radians((solar-12)*15); la=np.radians(LAT0)
    el=np.arcsin(np.sin(la)*np.sin(dec)+np.cos(la)*np.cos(dec)*np.cos(Hh))
    az=np.arctan2(np.sin(Hh),np.cos(Hh)*np.sin(la)-np.tan(dec)*np.cos(la))+np.pi   # from north, clockwise
    return np.degrees(el),np.degrees(az)
def shade(el,az,person=1.5):
    t=np.tan(np.radians(el)); u=(np.sin(np.radians(az)),np.cos(np.radians(az)))  # east,north toward sun
    dmax=min((hb.max()-person)/t,400); pad=int(dmax/CELL)+2
    P=np.pad(hb,pad); sh=np.zeros((H,W),bool); seen=set()
    for d in np.arange(0,dmax+1,2.5):
        dr=int(round(-d*u[1]/CELL)); dc=int(round(d*u[0]/CELL))
        if (dr,dc) in seen: continue
        seen.add((dr,dc))
        sh|= (P[pad+dr:pad+dr+H, pad+dc:pad+dc+W]-d*t)>person
    return sh
HOURS=[10,12,14,16,18]
walk=load('ist_PET_rev00.tif')>-9000      # False = Gebaeude
shade_fr={}; sun_info={}
sh_pal=[(0,0,0)]+[(22,38,70)]*8; sh_alpha=[0]+[int(a) for a in np.linspace(40,150,8)]
for hr in HOURS:
    el,az=sun(hr); sun_info[hr]=[round(el,1),round(az,1)]
    sh=shade(el,az)&walk; log('shade',hr,'el %.1f az %.1f'%(el,az),'share %.3f'%sh.mean())
    f=ndi.uniform_filter(sh.astype('float32'),3)
    o,ins=warp(f,order=1)
    idx=np.where(ins&(o>0.08),np.clip(np.ceil(o*8),1,8),0)
    sz=save_indexed(idx,sh_pal,f'{OUT}/img/shade_{hr}.png',sh_alpha); log('  png',sz//1024,'KB')
    g=blockmean(sh.astype('float32'),walk)
    g=np.nan_to_num(g,nan=0.0)
    shade_fr[hr]=np.clip(np.round(g*255),0,255).astype(np.uint8)

# ---------- 4. Cool patches (20 m cells with mean PET <= 29 °C, >= 2000 m²) ----------
g=grids['pet_ist']<=int(round((29.0-10)*6))
lab2,n2=ndi.label(g,structure=np.ones((3,3)))
sizes=ndi.sum(g,lab2,range(1,n2+1)); keep=np.zeros(n2+1,bool); keep[1:]=sizes*400>=2000
lab2=np.where(keep[lab2],lab2,0)
ids=np.unique(lab2[lab2>0]); remap=np.zeros(n2+1,np.uint16); remap[ids]=np.arange(1,len(ids)+1)
patch=remap[lab2].astype(np.uint16); n2=len(ids)
area=ndi.sum(patch>0,patch,range(1,n2+1))*400
grids['patch']=patch
log('cool patches',n2,'cells',int((patch>0).sum()),'share %.3f'%((patch>0).mean()))
log('patch area pct',np.percentile(area,[10,50,90,100]))

# ---------- 5. Trees ----------
fc=json.load(open(A+[f for f in os.listdir(A) if 'Baumkataster' in f][0],encoding='utf-8',errors='replace'))['features']
pts=np.array([f['geometry']['coordinates'] for f in fc]); 
la,lo=tm.inverse(pts[:,0],pts[:,1])
sp={}; dev={'Jugendphase':1,'Reifephase':2,'Alterungsphase':3}
sp_list=[]; rows=[]
for f,a_,o_ in zip(fc,la,lo):
    p=f['properties']; key=(p.get('Baumart deutsch') or '').strip()+'|'+(p.get('Baumart botanisch') or '').strip()
    if key not in sp: sp[key]=len(sp_list); sp_list.append(key.split('|'))
    rows.append([round(float(a_),5),round(float(o_),5),sp[key],dev.get(p.get('Entwicklung'),0)])
log('trees',len(rows),'species',len(sp_list), 'devs',{k:sum(1 for r in rows if r[3]==v) for k,v in dev.items()})
# tree sanity: share of trees on cells with structure height >=3 m
EE,NN=pts[:,0],pts[:,1]; cc=((EE-X0)/CELL).astype(int); rr=((Y0-NN)/CELL).astype(int); ok=(cc>=0)&(cc<W)&(rr>=0)&(rr<H)
log('trees inside raster',ok.mean(),'on h>=3m',(hst[rr[ok],cc[ok]]>=3).mean())

# ---------- 6. data.js ----------
def pack(a): return base64.b64encode(zlib.compress(a.astype(a.dtype).tobytes(),9)).decode()
data={'meta':{'bounds':[[bounds_ll[0][0],bounds_ll[0][1]],[bounds_ll[1][0],bounds_ll[1][1]]],
 'grid':{'x0':X0,'y0':Y0,'cell':CELL*GCELL,'w':GW,'h':GH},
 'hours':HOURS,'sun':sun_info,'stats':stats,'patchArea':[int(x) for x in area],
 'enc':{'pet':{'off':10,'scale':6},'t04':{'off':5,'scale':10}}},
 'grids':{k:{'t':'u16' if k=='patch' else 'u8','d':pack(v)} for k,v in grids.items()},
 'shade':{str(h):{'t':'u8','d':pack(v)} for h,v in shade_fr.items()},
 'species':sp_list,'trees':rows}
js='window.HK_DATA='+json.dumps(data,separators=(',',':'))+';'
open(OUT+'/data.js','w').write(js); log('data.js',len(js)//1024,'KB')
