from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from datetime import datetime


def create_example_invoice(path='example-invoice.pdf'):
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4

    # Header
    c.setFont('Helvetica-Bold', 18)
    c.drawString(50, height - 80, 'Rechnung / Invoice')

    c.setFont('Helvetica', 11)
    # Invoice metadata
    lines = [
        f'Rechnungsnummer: 12345',
        f'Datum: {datetime.today().strftime("%d.%m.%Y")}',
        '',
        'Lieferant: Lieferant GmbH',
        'Stra: Musterstra 7',
        '12345 Musterstadt',
        'USt-Id: DE123456789',
        '',
        'Kunde: Beispiel Kunde AG',
        'Stra: Kundenweg 1',
        '54321 Kundenstadt',
        '',
        'Leistungszeitraum: 01.01.2025 - 31.01.2025',
        '',
        'Positionen:',
        '1) Beratungsleistung - 10 Std. x 50,00 EUR = 500,00 EUR',
        '',
        'Zwischensumme: 500,00 EUR',
        'Umsatzsteuer (19%): 95,00 EUR',
        'Gesamtbetrag (Brutto): 595,00 EUR',
    ]

    text = c.beginText(50, height - 120)
    text.setFont('Helvetica', 11)
    text.setLeading(14)
    for ln in lines:
        text.textLine(ln)
    c.drawText(text)

    # Footer / bank details
    c.setFont('Helvetica-Bold', 10)
    c.drawString(50, 100, 'Zahlungsdetails: ')
    c.setFont('Helvetica', 10)
    c.drawString(160, 100, 'IBAN: DE89370400440532013000  BIC: COBADEFFXXX  Bank: Musterbank')

    c.showPage()
    c.save()
    print(f'Wrote example PDF to: {path}')


if __name__ == '__main__':
    create_example_invoice()
