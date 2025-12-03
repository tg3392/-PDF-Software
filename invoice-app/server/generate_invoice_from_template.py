from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

def mm_to_pt(mm_val):
    return mm_val * mm

def generate_invoice(path):
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4

    # Header
    c.setFont('Helvetica-Bold', 20)
    c.drawCentredString(width/2, height - mm_to_pt(20), 'Rechnung')

    c.setFont('Helvetica', 10)
    # Invoice meta
    left_x = mm_to_pt(20)
    right_x = width - mm_to_pt(80)
    y = height - mm_to_pt(35)

    c.drawString(left_x, y, 'Rechnungsnummer:')
    c.setFont('Helvetica-Bold', 10)
    c.drawString(left_x + mm_to_pt(40), y, 'INV-2025-1001')
    c.setFont('Helvetica', 10)
    y -= mm_to_pt(6)
    c.drawString(left_x, y, 'Rechnungsdatum:')
    c.setFont('Helvetica-Bold', 10)
    c.drawString(left_x + mm_to_pt(40), y, '2025-11-30')
    c.setFont('Helvetica', 10)
    y -= mm_to_pt(6)
    c.drawString(left_x, y, 'Leistungsdatum:')
    c.setFont('Helvetica-Bold', 10)
    c.drawString(left_x + mm_to_pt(40), y, '2025-11-28')

    # Supplier (left) and Customer (right)
    sup_y = height - mm_to_pt(55)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(left_x, sup_y, 'Lieferant')
    c.setFont('Helvetica', 10)
    sup_y -= mm_to_pt(5)
    c.drawString(left_x, sup_y, 'Meine GmbH')
    sup_y -= mm_to_pt(5)
    c.drawString(left_x, sup_y, 'Musterstraße 1')
    sup_y -= mm_to_pt(5)
    c.drawString(left_x, sup_y, '12345 Musterstadt')

    # Customer
    cust_x = right_x
    cust_y = height - mm_to_pt(55)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(cust_x, cust_y, 'Beispielkunde AG')
    c.setFont('Helvetica', 10)
    cust_y -= mm_to_pt(5)
    c.drawString(cust_x, cust_y, 'Kundenstraße 5')
    cust_y -= mm_to_pt(5)
    c.drawString(cust_x, cust_y, '54321 Kundenstadt')
    cust_y -= mm_to_pt(5)
    c.drawString(cust_x, cust_y, 'DE')

    # Items table
    table_y = height - mm_to_pt(110)
    data = [
        ['Beschreibung', 'Menge', 'Einheit', 'Einzelpreis (netto)', 'Gesamt (netto)'],
        ['Beratungsleistung: Softwareintegration', '10', 'h', '75.00 €', '750.00 €'],
        ['Support (monatlich)', '1', 'Service', '150.00 €', '150.00 €']
    ]

    table = Table(data, colWidths=[mm_to_pt(90), mm_to_pt(15), mm_to_pt(20), mm_to_pt(30), mm_to_pt(30)])
    style = TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (-1,0), colors.lightgrey),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('ALIGN', (1,1), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ])
    table.setStyle(style)
    table.wrapOn(c, width, height)
    table.drawOn(c, left_x, table_y - mm_to_pt(30))

    # Totals box
    totals_x = left_x + mm_to_pt(100)
    totals_y = table_y - mm_to_pt(50)
    c.setFont('Helvetica', 10)
    c.drawString(totals_x, totals_y, 'Zwischensumme (netto)')
    c.drawRightString(totals_x + mm_to_pt(60), totals_y, '900.00 €')
    totals_y -= mm_to_pt(6)
    c.drawString(totals_x, totals_y, 'USt 19%')
    c.drawRightString(totals_x + mm_to_pt(60), totals_y, '171.00 €')
    totals_y -= mm_to_pt(6)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(totals_x, totals_y, 'Rechnungsbetrag (brutto)')
    c.drawRightString(totals_x + mm_to_pt(60), totals_y, '1071.00 €')

    # Payment details
    pay_x = left_x
    pay_y = totals_y - mm_to_pt(25)
    c.setFont('Helvetica', 9)
    c.drawString(pay_x, pay_y, 'Zahlungsziel: 14 Tage')
    pay_y -= mm_to_pt(5)
    c.drawString(pay_x, pay_y, 'IBAN: DE89370400440532013000')
    pay_y -= mm_to_pt(5)
    c.drawString(pay_x, pay_y, 'BIC: COBADEFFXXX')
    pay_y -= mm_to_pt(7)
    c.drawString(pay_x, pay_y, 'Verwendungszweck: INV-2025-1001')

    # Footer note
    c.setFont('Helvetica-Oblique', 9)
    c.drawString(left_x, mm_to_pt(20), 'Vielen Dank für Ihren Auftrag.')

    c.showPage()
    c.save()

if __name__ == '__main__':
    out_path = 'example-invoice-for-upload.pdf'
    generate_invoice(out_path)
    print('PDF generated:', out_path)
