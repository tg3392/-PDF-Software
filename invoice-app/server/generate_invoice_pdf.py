import json
from pathlib import Path

DATA_FILE = Path(__file__).with_name('example-outgoing-invoice.json')
OUT_PDF = Path(__file__).with_name('example-outgoing-invoice.pdf')

def render_pdf(data, out_path):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet
    except Exception as e:
        raise RuntimeError('reportlab is required. Install with: pip install reportlab') from e

    doc = SimpleDocTemplate(str(out_path), pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    elements = []

    # Header
    elements.append(Paragraph(f"<b>Rechnung</b>", styles['Title']))
    elements.append(Spacer(1, 6))
    meta = f"Rechnungsnummer: <b>{data.get('invoiceNumber')}</b><br/>Rechnungsdatum: <b>{data.get('invoiceDate')}</b><br/>Leistungsdatum: <b>{data.get('serviceDate')}</b>"
    elements.append(Paragraph(meta, styles['Normal']))
    elements.append(Spacer(1, 12))

    # Vendor / Customer
    vendor = data.get('vendor', {})
    customer = data.get('customer', {})
    vendor_block = f"<b>{vendor.get('name','')}</b><br/>{vendor.get('street','')}<br/>{vendor.get('zip_code','')} {vendor.get('city','')}<br/>{vendor.get('country','')}<br/>USt‑IdNr.: {vendor.get('vat_id','')}"
    customer_block = f"<b>{customer.get('name','')}</b><br/>{customer.get('street','')}<br/>{customer.get('zip_code','')} {customer.get('city','')}<br/>{customer.get('country','')}"
    tbl = Table([[Paragraph(vendor_block, styles['Normal']), Paragraph(customer_block, styles['Normal'])]], colWidths=[260*mm/2, 260*mm/2])
    elements.append(tbl)
    elements.append(Spacer(1, 12))

    # Items table
    items = data.get('items', [])
    table_data = [['Pos', 'Beschreibung', 'Menge', 'Einheit', 'Einzelpreis (netto)', 'Gesamt (netto)']]
    for it in items:
        table_data.append([
            str(it.get('pos','')),
            it.get('description',''),
            str(it.get('quantity','')),
            it.get('unit',''),
            f"{it.get('unit_price_net',0):.2f} €",
            f"{it.get('line_total_net',0):.2f} €",
        ])

    t = Table(table_data, colWidths=[30*mm, 80*mm, 25*mm, 25*mm, 40*mm, 40*mm])
    t.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND',(0,0),(-1,0), colors.lightgrey),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
    ]))
    elements.append(t)
    elements.append(Spacer(1,12))

    # Totals
    totals = data.get('totals', {})
    total_net = totals.get('total_net', 0)
    tax_lines = totals.get('taxes', [])
    total_gross = totals.get('total_gross', 0)

    totals_table = [['Bezeichnung', 'Betrag']]
    totals_table.append(['Zwischensumme (netto)', f"{total_net:.2f} €"])
    for tax in tax_lines:
        totals_table.append([f"USt {tax.get('rate')}", f"{tax.get('amount'):.2f} €"])
    totals_table.append(['Rechnungsbetrag (brutto)', f"{total_gross:.2f} €"])

    tt = Table(totals_table, colWidths=[120*mm, 60*mm], hAlign='RIGHT')
    tt.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND',(0,0),(-1,0), colors.whitesmoke),
        ('ALIGN',(1,0),(-1,-1),'RIGHT')
    ]))
    elements.append(tt)
    elements.append(Spacer(1,12))

    # Payment
    payment = data.get('payment', {})
    bank = payment.get('bank', {})
    pay_block = f"Zahlungsziel: {payment.get('due_days','')} Tage<br/>IBAN: {bank.get('iban','')}<br/>BIC: {bank.get('bic','')}<br/>Verwendungszweck: {payment.get('reference','')}"
    elements.append(Paragraph(pay_block, styles['Normal']))
    elements.append(Spacer(1,12))

    elements.append(Paragraph(data.get('notes',''), styles['Normal']))

    doc.build(elements)

def main():
    if not DATA_FILE.exists():
        print('Data JSON not found:', DATA_FILE)
        return 2
    data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
    try:
        render_pdf(data, OUT_PDF)
        print('PDF generated:', OUT_PDF)
        return 0
    except Exception as e:
        print('Error generating PDF:', e)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
