import numpy as np, tifffile, glob, os
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
A=os.environ.get('HK_INPUT','./rohdaten')+'/'
def load(name):
    f=glob.glob(A+'*'+name)[0]
    try: a=tifffile.imread(f)
    except Exception: a=np.array(Image.open(f))
    return a.astype('float32')
