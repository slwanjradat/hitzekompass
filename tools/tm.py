import numpy as np
a=6378137.0; f=1/298.257222101; n=f/(2-f); k0=0.9996; E0=500000.0; lam0=np.radians(9.0)
A=a/(1+n)*(1+n**2/4+n**4/64)
al=[n/2-2*n**2/3+5*n**3/16+41*n**4/180, 13*n**2/48-3*n**3/5+557*n**4/1440, 61*n**3/240-103*n**4/140, 49561*n**4/161280]
be=[n/2-2*n**2/3+37*n**3/96-n**4/360, n**2/48+n**3/15-437*n**4/1440, 17*n**3/480-37*n**4/840, 4397*n**4/161280]
de=[2*n-2*n**2/3-2*n**3+116*n**4/45, 7*n**2/3-8*n**3/5-227*n**4/45, 56*n**3/15-136*n**4/35, 4279*n**4/630]
def forward(lat,lon):
    p=np.radians(lat); l=np.radians(lon)-lam0
    c=2*np.sqrt(n)/(1+n)
    t=np.sinh(np.arctanh(np.sin(p))-c*np.arctanh(c*np.sin(p)))
    xi=np.arctan2(t,np.cos(l)); eta=np.arctanh(np.sin(l)/np.sqrt(1+t*t))
    E=eta.copy() if hasattr(eta,'copy') else eta; N=xi
    Es=eta; Ns=xi
    for j,aj in enumerate(al,1):
        Es=Es+aj*np.cos(2*j*xi)*np.sinh(2*j*eta); Ns=Ns+aj*np.sin(2*j*xi)*np.cosh(2*j*eta)
    return E0+k0*A*Es, k0*A*Ns
def inverse(E,N):
    xi=N/(k0*A); eta=(E-E0)/(k0*A)
    xp=xi; ep=eta
    for j,bj in enumerate(be,1):
        xp=xp-bj*np.sin(2*j*xi)*np.cosh(2*j*eta); ep=ep-bj*np.cos(2*j*xi)*np.sinh(2*j*eta)
    chi=np.arcsin(np.sin(xp)/np.cosh(ep))
    phi=chi
    for j,dj in enumerate(de,1): phi=phi+dj*np.sin(2*j*chi)
    lam=lam0+np.arctan2(np.sinh(ep),np.cos(xp))
    return np.degrees(phi),np.degrees(lam)
R=6378137.0
def to3857(lat,lon):
    return R*np.radians(lon), R*np.log(np.tan(np.pi/4+np.radians(lat)/2))
def from3857(x,y):
    return np.degrees(2*np.arctan(np.exp(y/R))-np.pi/2), np.degrees(x/R)
if __name__=='__main__':
    # tests
    print('central meridian eq:',inverse(np.array(500000.0),np.array(0.0)))
    lat,lon=inverse(np.array(559288.87),np.array(5778993.772)); print('tree',lat,lon)
    E,N=forward(lat,lon); print('roundtrip',E-559288.87,N-5778993.772)
    # scale check: known ETRS89 UTM32 of lat 52.0 lon 9.0 -> E 500000, N 5761?? (arc length)
    print('lat52 lon9 ->',forward(np.array(52.0),np.array(9.0)))
    # raster centre
    cx=556847.5+3161*5/2; cy=5784267.5-2705*5/2
    print('raster centre ->',inverse(np.array(cx),np.array(cy)))
