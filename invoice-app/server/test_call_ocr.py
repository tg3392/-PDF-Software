import sys, asyncio
sys.path.insert(0, r'd:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server')
import importlib

m = importlib.import_module('ocr_fastapi_single')

class Dummy:
    def __init__(self, path):
        self.filename = 'example-invoice.pdf'
        self.content_type = 'application/pdf'
        self._path = path

    async def read(self):
        with open(self._path, 'rb') as f:
            return f.read()

async def run():
    res = await m.api_ocr(Dummy(r'd:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server\example-invoice.pdf'))
    if hasattr(res, 'status_code'):
        print('status', res.status_code)
        # body may be bytes
        try:
            print(res.body.decode())
        except Exception:
            print(res.body)
    else:
        print(res)

if __name__ == '__main__':
    asyncio.run(run())
