import sys, traceback
p=r'D:\Studium\5.Semester\Softwaretechnik-Labor\-PDF-Software\invoice-app\server'
sys.path.insert(0,p)
try:
    import importlib
    importlib.import_module('ocr_engine')
    print('IMPORT_OK')
except Exception as e:
    print('IMPORT_FAIL')
    traceback.print_exc()
