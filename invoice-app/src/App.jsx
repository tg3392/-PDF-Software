/*
  Frontend Hauptkomponente (React)

  Diese Komponente enthält die gesamte kleine UI für Upload, Überprüfung
  und Trainings-Preview. Die wichtigsten Punkte:
  - Upload: PDF auswählen, Datei wird an `/api/ocr` geschickt. Die
    Server-Antwort (ocrText) geht dann an `/nlp/extract`.
  - Review/Überprüfung: Hier siehst du erkannte Felder, kannst sie
    manuell korrigieren und Feedback absenden.
  - Training: Verifizierte Rechnungen werden hier gezählt (Pseudofeature).

  Hinweis: Die UI ist bewusst simpel und für manuelle Prüfungen gedacht.
*/
import React, { useState, useEffect } from 'react';
import { ocrUpload, nlpExtract } from './lib/api';
import { Upload, Download, Settings, CheckCircle, AlertCircle, Eye } from 'lucide-react';
// Hinweis: Kompakte Company-Formular-Komponente wurde durch Inline-UI ersetzt


const InvoiceApp = () => {
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [trainingMode, setTrainingMode] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [trainingData, setTrainingData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [company, setCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyStreet, setCompanyStreet] = useState('');
  const [companyZip, setCompanyZip] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyVat, setCompanyVat] = useState('');

  // Lade Firmenprofil vom Server
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/company');
        const j = await r.json();
        if (j && j.company) setCompany(j.company);
      } catch (e) {
        console.error('failed to load company', e);
      }
    };
    load();
  }, []);

  // Setze Editier-Felder beim Betreten des Bearbeitungsmodus
  useEffect(() => {
    if (editingCompany && company) {
      setCompanyName(company.name || '');
      setCompanyStreet(company.street || '');
      setCompanyZip(company.zip_code || '');
      setCompanyCity(company.city || '');
      setCompanyVat(company.vat_id || '');
    }
  }, [editingCompany, company]);

  const saveCompany = async () => {
    try {
      const payload = { name: companyName, street: companyStreet, zip_code: companyZip, city: companyCity, vat_id: companyVat };
      const r = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j && (j.ok || j.created || j.updated)) {
        // reload
        const rr = await fetch('/api/company');
        const jj = await rr.json();
        if (jj && jj.company) setCompany(jj.company);
        setEditingCompany(false);
      }
    } catch (e) {
      console.error('saveCompany error', e);
    }
  };

  // Echte Pipeline: PDF an `/api/ocr` senden, dann `/nlp/extract` aufrufen
  const processInvoice = async (file) => {
    // Ablaufbeschreibung:
    // 1) Erstellung eines FormData-Objekts und Senden der Datei an `/api/ocr`.
    // 2) Empfang von `ocrText` (oder einer strukturierten OCR-Antwort) vom Server.
    // 3) Aufruf von `/nlp/extract` mit dem `ocrText`, Rückgabe eines
    //    `extractedData`-Objekts und Abbildung der Felder in den Invoice-State.
    // 4) Bei fehlendem OCR-Text oder Extraktionsfehlern wird ein Fallback-Eintrag verwendet.
    const fallbackSimulated = () => ({
      id: Date.now(),
      fileName: file.name,
      uploadDate: new Date().toLocaleDateString('de-DE'),
      type: Math.random() > 0.5 ? 'Ausgangsrechnung' : 'Eingangsrechnung',
      invoiceNumber: `RG-${Math.floor(Math.random() * 10000)}`,
      date: new Date().toLocaleDateString('de-DE'),
      vendor: 'Unbekannt',
      totalAmount: '0.00',
      currency: 'EUR',
      taxAmount: '0.00',
      description: 'Automatisch erfasst',
      items: [],
      confidence: (Math.random() * 30 + 70).toFixed(1),
      verified: false,
      corrections: {}
    });

    // Erstelle eine Basis-Rechnung (schneller Fallback), damit die UI sofort etwas anzeigt
    let invoiceBase = fallbackSimulated();

    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const ocrResp = await ocrUpload(form);
      const ocrText = (ocrResp && (ocrResp.ocrText || ocrResp.text)) ? (ocrResp.ocrText || ocrResp.text) : null;

      if (!ocrText) {
        // Kein OCR-Text zurückerhalten — verwende Fallback-Eintrag
        setInvoices(prev => [...prev, invoiceBase]);
        setTrainingData(prev => [...prev, invoiceBase]);
        return;
      }

      // Rufe den NLP-Extraktor auf
      const nlpResp = await nlpExtract({ requestId: 'ui-' + Date.now(), ocrText });

      // Normalisiere die vorhergesagten extrahierten Daten
      const ed = (nlpResp && (nlpResp.data && nlpResp.data.extractedData)) || (nlpResp && nlpResp.prediction && nlpResp.prediction.extractedData) || (nlpResp && nlpResp.extractedData) || {};

      // Unterstütze auch das Array `data.fields` (älteres/alternatives Format)
      const fieldsObj = {};
      if (nlpResp && nlpResp.data && Array.isArray(nlpResp.data.fields)) {
        nlpResp.data.fields.forEach(f => { if (f && f.name) fieldsObj[f.name] = f.value; });
      }

      // Merge in das Invoice-Objekt (vorzugsweise NLP-Werte verwenden)
      const merged = {
        id: invoiceBase.id,
        fileName: invoiceBase.fileName,
        uploadDate: invoiceBase.uploadDate,
        type: fieldsObj.TYPE || (ed && ed.classification) || invoiceBase.type,
        invoiceNumber: fieldsObj.INVOICE_NO || ed.invoiceNumber || invoiceBase.invoiceNumber,
        date: fieldsObj.INVOICE_DATE || ed.issueDate || invoiceBase.date,
        vendor: fieldsObj.SUPPLIER_NAME || (ed.vendor && ed.vendor.name) || invoiceBase.vendor,
        vendorAddressRaw: fieldsObj.SUPPLIER_ADDRESS || (ed.vendor && ed.vendor.raw) || undefined,
        vendorStreet: fieldsObj.SUPPLIER_ADDRESS_STREET || (ed.vendor && ed.vendor.street) || undefined,
        vendorCity: fieldsObj.SUPPLIER_ADDRESS_CITY || ((ed.vendor && ((ed.vendor.zip_code ? (ed.vendor.zip_code + ' ') : '') + (ed.vendor.city || ''))) || undefined),
        recipientName: fieldsObj.RECIPIENT_NAME || (ed.recipient && ed.recipient.name) || undefined,
        recipientAddressRaw: fieldsObj.RECIPIENT_ADDRESS || (ed.recipient && ed.recipient.raw) || undefined,
        recipientStreet: fieldsObj.RECIPIENT_STREET || (ed.recipient && ed.recipient.street) || undefined,
        recipientCity: fieldsObj.RECIPIENT_CITY || ((ed.recipient && ((ed.recipient.zip_code ? (ed.recipient.zip_code + ' ') : '') + (ed.recipient.city || ''))) || undefined),
        items: fieldsObj.ITEMS ? ((() => { try { return JSON.parse(fieldsObj.ITEMS); } catch(e){ return ed.items || invoiceBase.items; } })()) : (ed.items || invoiceBase.items),
        totalAmount: fieldsObj.TOTAL_GROSS || ed.grossTotal || invoiceBase.totalAmount,
        grossTotal: fieldsObj.TOTAL_GROSS || ed.grossTotal || invoiceBase.grossTotal || invoiceBase.totalAmount,
        taxAmount: fieldsObj.VAT_AMOUNT || ed.vatAmount || invoiceBase.taxAmount,
        taxId: fieldsObj.TAX_ID || ed.taxId || ed.taxId || undefined,
        taxNumber: fieldsObj.TAX_NUMBER || ed.taxNumber || undefined,
        paymentTerms: fieldsObj.PAYMENT_TERMS || ed.paymentTerms || undefined,
        usage: fieldsObj.USAGE || ed.usage || undefined,
        iban: fieldsObj.IBAN || ed.iban || undefined,
        bic: fieldsObj.BIC || ed.bic || undefined,
        bankName: fieldsObj.BANK_NAME || (ed.vendor && ed.vendor.bank) || undefined,
        description: invoiceBase.description,
        ocrText: ocrText || '',
        confidence: Math.round((nlpResp && nlpResp.data && nlpResp.data.confidence ? nlpResp.data.confidence : (nlpResp && nlpResp.confidence) || 0) * 100)/100 || invoiceBase.confidence,
        verified: false,
        corrections: {}
      };

      setInvoices(prev => [...prev, merged]);
      setTrainingData(prev => [...prev, merged]);
    } catch (e) {
      console.warn('processInvoice: OCR/NLP pipeline failed, using fallback', e);
      setInvoices(prev => [...prev, invoiceBase]);
      setTrainingData(prev => [...prev, invoiceBase]);
    }
  };

  const handleFileUpload = (e) => {
    const files = e.target.files;
    Array.from(files).forEach(file => {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        processInvoice(file);
      }
    });
  };

  const updateInvoiceField = (invoiceId, field, value) => {
    // Einfache lokale Aktualisierung einer Rechnung im Zustand.
    // Die Korrektur wird zusätzlich in `corrections` gespeichert, sodass
    // die Feedback-Funktion später nachvollziehen kann, welche Änderungen vorgenommen wurden.
    setInvoices(invoices.map(inv => 
      inv.id === invoiceId 
        ? { ...inv, [field]: value, corrections: { ...inv.corrections, [field]: value } }
        : inv
    ));
  };

  const verifyInvoice = (invoiceId) => {
    setInvoices(invoices.map(inv =>
      inv.id === invoiceId ? { ...inv, verified: true } : inv
    ));
  };

  const exportToExcel = () => {
    const headers = ['Rechnungsnummer', 'Typ', 'Datum', 'Lieferant', 'Lieferant Adresse', 'Empfänger', 'Empfänger Adresse', 'Gesamtbetrag (Netto)', 'Gesamtbetrag (Brutto)', 'Währung', 'Steuerbetrag', 'USt-Id', 'Steuernummer', 'IBAN', 'BIC', 'Bank', 'Verwendungszweck', 'Vertrauenswert', 'Status'];
    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.type,
      inv.date,
      inv.vendor,
      inv.vendorAddressRaw || '',
      inv.recipientName || '',
      inv.recipientAddressRaw || '',
      inv.totalAmount || '',
      inv.grossTotal || '',
      inv.currency || '',
      inv.taxAmount || '',
      inv.taxId || '',
      inv.taxNumber || '',
      inv.iban || '',
      inv.bic || '',
      inv.bankName || '',
      inv.usage || '',
      (inv.confidence !== undefined ? (String(inv.confidence) + '%') : ''),
      inv.verified ? 'Verifiziert' : 'Ungeprüft'
    ]);

    const csvContent = [
      headers.join('\t'),
      ...rows.map(row => row.join('\t'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen_export_${Date.now()}.csv`;
    a.click();
  };

  const exportFullData = () => {
    const data = invoices.map(inv => ({
      rechnungsnummer: inv.invoiceNumber,
      typ: inv.type,
      datum: inv.date,
      lieferant: inv.vendor,
      lieferant_adresse_raw: inv.vendorAddressRaw || null,
      empfänger_name: inv.recipientName || null,
      empfänger_adresse_raw: inv.recipientAddressRaw || null,
      gesamtbetrag_netto: inv.totalAmount || null,
      gesamtbetrag_brutto: inv.grossTotal || null,
      währung: inv.currency || null,
      steuerbetrag: inv.taxAmount || null,
      ust_id: inv.taxId || null,
      steuernummer: inv.taxNumber || null,
      iban: inv.iban || null,
      bic: inv.bic || null,
      bankname: inv.bankName || null,
      verwendungszweck: inv.usage || null,
      beschreibung: inv.description || null,
      vertrauenswert: inv.confidence || null,
      verifiziert: inv.verified || false,
      artikel: inv.items || []
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen_vollständig_${Date.now()}.json`;
    a.click();
  };

  // Feedback-/Fehler-Metatate: Zustand und Helferfunktionen
  const [feedbacks, setFeedbacks] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbInvoiceId, setFbInvoiceId] = useState(null);
  const [fbField, setFbField] = useState('invoiceNumber');
  const [fbDetectedText, setFbDetectedText] = useState('');
  const [fbCorrectText, setFbCorrectText] = useState('');
  const [fbPage, setFbPage] = useState(1);
  const [fbBBox, setFbBBox] = useState({ x: '', y: '', width: '', height: '' });
  const [fbErrorType, setFbErrorType] = useState('ocr'); // 'ocr' or 'nlp'
  const [fbFormat, setFbFormat] = useState('json'); // 'json' or 'xml'

  const openFeedback = (invoiceId, field) => {
    const inv = invoices.find(i => i.id === invoiceId);
    setFbInvoiceId(invoiceId);
    setFbField(field);
    setFbDetectedText(inv ? (inv[field] ?? '') : '');
    setFbCorrectText('');
    setFbPage(1);
    setFbBBox({ x: '', y: '', width: '', height: '' });
    setFbErrorType('ocr');
    setFbFormat('json');
    setShowFeedbackModal(true);
  };

  // OCR-Panel-Zustand: Anzeige-Steuerung und ausgewählte Zielfeld-Mappings pro Rechnung
  const [ocrPanelOpen, setOcrPanelOpen] = useState({});
  const [ocrSelectedField, setOcrSelectedField] = useState({});

  const toggleOcrPanel = (invoiceId) => {
    setOcrPanelOpen(prev => ({ ...prev, [invoiceId]: !prev[invoiceId] }));
  };

  const updateOcrText = (invoiceId, text) => {
    // store edited OCR text back into invoice state
    updateInvoiceField(invoiceId, 'ocrText', text);
  };

  const applyOcrToField = (invoiceId) => {
    const field = ocrSelectedField[invoiceId];
    const inv = invoices.find(i => i.id === invoiceId);
    if (!field || !inv) return;
    const text = inv.ocrText || '';
    updateInvoiceField(invoiceId, field, text);
  };

  const submitFeedback = () => {
    const feedback = {
      id: Date.now(),
      invoiceId: fbInvoiceId,
      field: fbField,
      detectedText: fbDetectedText,
      correctText: fbCorrectText,
      page: fbPage,
      bbox: {
        x: parseFloat(fbBBox.x) || 0,
        y: parseFloat(fbBBox.y) || 0,
        width: parseFloat(fbBBox.width) || 0,
        height: parseFloat(fbBBox.height) || 0,
      },
      errorType: fbErrorType,
      timestamp: new Date().toISOString()
    };

    // Feedback lokal speichern und als Download vorbereiten.
    // Wichtig: Dieses Feedback wird nicht automatisch an das Backend
    // gesendet — in dieser UI wird es als JSON/XML zum Herunterladen
    // bereitgestellt, damit ein Operator es später manuell verarbeiten
    // oder per Tool in das Trainingssystem eingespeist werden kann.
    setFeedbacks(prev => [...prev, feedback]);

    // also attach to invoice for UI traceability
    setInvoices(prev => prev.map(inv => inv.id === fbInvoiceId ? { ...inv, correctionsFeedback: [...(inv.correctionsFeedback||[]), feedback] } : inv));

    // prepare payload and trigger download in chosen format
    if (fbFormat === 'json') {
      const blob = new Blob([JSON.stringify(feedback, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_${feedback.id}.json`;
      a.click();
    } else {
      // Einfache XML-Serialisierung des Feedback-Objekts
      const xml = `<?xml version="1.0" encoding="utf-8"?>\n<feedback>\n  <id>${feedback.id}</id>\n  <invoiceId>${feedback.invoiceId}</invoiceId>\n  <field>${feedback.field}</field>\n  <detectedText>${escapeXml(feedback.detectedText)}</detectedText>\n  <correctText>${escapeXml(feedback.correctText)}</correctText>\n  <page>${feedback.page}</page>\n  <bbox>\n    <x>${feedback.bbox.x}</x>\n    <y>${feedback.bbox.y}</y>\n    <width>${feedback.bbox.width}</width>\n    <height>${feedback.bbox.height}</height>\n  </bbox>\n  <errorType>${feedback.errorType}</errorType>\n  <timestamp>${feedback.timestamp}</timestamp>\n</feedback>`;
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_${feedback.id}.xml`;
      a.click();
    }

    setShowFeedbackModal(false);
  };

  const escapeXml = (unsafe) => {
    if (!unsafe) return '';
    return String(unsafe).replace(/[<>&'\"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
      }
    });
  };

  const exportAllFeedbacks = (format = 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(feedbacks, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_feedbacks_${Date.now()}.json`;
      a.click();
    } else {
      let xml = '<?xml version="1.0" encoding="utf-8"?>\n<feedbacks>\n';
      feedbacks.forEach(fb => {
        xml += '  <feedback>\n';
        xml += `    <id>${fb.id}</id>\n`;
        xml += `    <invoiceId>${fb.invoiceId}</invoiceId>\n`;
        xml += `    <field>${fb.field}</field>\n`;
        xml += `    <detectedText>${escapeXml(fb.detectedText)}</detectedText>\n`;
        xml += `    <correctText>${escapeXml(fb.correctText)}</correctText>\n`;
        xml += `    <page>${fb.page}</page>\n`;
        xml += '    <bbox>\n';
        xml += `      <x>${fb.bbox.x}</x>\n`;
        xml += `      <y>${fb.bbox.y}</y>\n`;
        xml += `      <width>${fb.bbox.width}</width>\n`;
        xml += `      <height>${fb.bbox.height}</height>\n`;
        xml += '    </bbox>\n';
        xml += `    <errorType>${fb.errorType}</errorType>\n`;
        xml += `    <timestamp>${fb.timestamp}</timestamp>\n`;
        xml += '  </feedback>\n';
      });
      xml += '</feedbacks>';
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_feedbacks_${Date.now()}.xml`;
      a.click();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📋 Rechnungsverarbeitung KI</h1>
          <p className="text-gray-600">Automatische Erfassung von Ein- und Ausgangsrechnungen</p>
          <div>
            <CompanyForm onChange={(c)=>{ /* noop */ }} />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-200'
            }`}
          >
            <Upload className="inline mr-2" size={20} />
            Upload
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'review'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-200'
            }`}
          >
            <Eye className="inline mr-2" size={20} />
            Überprüfung ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('training')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'training'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-200'
            }`}
          >
            <Settings className="inline mr-2" size={20} />
            Lernen
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'export'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-200'
            }`}
          >
            <Download className="inline mr-2" size={20} />
            Export
          </button>
          {/* Demo-Registerkarte entfernt */}
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="border-2 border-dashed border-indigo-300 rounded-lg p-12 text-center hover:bg-indigo-50 transition cursor-pointer">
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                <Upload size={48} className="mx-auto text-indigo-600 mb-4" />
                <h3 className="text-xl font-semibold text-gray-800 mb-2">PDF-Dateien hochladen</h3>
                <p className="text-gray-600">Ziehen Sie PDF-Rechnungen hier hin oder klicken Sie zum Durchsuchen</p>
                <p className="text-sm text-gray-500 mt-4">Unterstützt Ein- und Ausgangsrechnungen</p>
              </label>
            </div>
            {invoices.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Zuletzt hochgeladen:</h3>
                <div className="space-y-2">
                  {invoices.slice(-5).reverse().map(inv => (
                    <div key={inv.id} className="p-3 bg-gray-100 rounded flex justify-between items-center">
                      <span className="font-medium text-gray-700">{inv.fileName}</span>
                      <span className={`px-3 py-1 rounded text-sm font-semibold ${inv.type === 'Ausgangsrechnung' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'}`}>
                        {inv.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            {invoices.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 text-lg">Noch keine Rechnungen hochgeladen</p>
              </div>
            ) : (
              <div className="space-y-6">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Rechnungsnummer</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.invoiceNumber}
                            onChange={(e) => updateInvoiceField(invoice.id, 'invoiceNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'invoiceNumber')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Typ</label>
                        <select
                          value={invoice.type}
                          onChange={(e) => updateInvoiceField(invoice.id, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        >
                          <option>Eingangsrechnung</option>
                          <option>Ausgangsrechnung</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Datum</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.date}
                            onChange={(e) => updateInvoiceField(invoice.id, 'date', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'date')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lieferant/Kunde</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.vendor}
                            onChange={(e) => updateInvoiceField(invoice.id, 'vendor', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'vendor')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Gesamtbetrag</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.totalAmount}
                            onChange={(e) => updateInvoiceField(invoice.id, 'totalAmount', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'totalAmount')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Steuerbetrag</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.taxAmount}
                            onChange={(e) => updateInvoiceField(invoice.id, 'taxAmount', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'taxAmount')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Beschreibung</label>
                      <div className="flex gap-2">
                        <textarea
                          value={invoice.description}
                          onChange={(e) => updateInvoiceField(invoice.id, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          rows="2"
                        />
                        <div className="flex-shrink-0">
                          <button onClick={() => openFeedback(invoice.id, 'description')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                    </div>

                    {/* Extended NLP fields (additional inputs shown in example UI) */}
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Leistungsdatum</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.serviceDate || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'serviceDate', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'serviceDate')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lieferant Straße / Ort (parsing)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.vendorStreet || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'vendorStreet', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Straße"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'vendorStreet')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={invoice.vendorCity || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'vendorCity', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="PLZ Ort"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Kunde Name</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.recipientName || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'recipientName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'recipientName')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Kunde Straße / Ort</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.recipientStreet || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'recipientStreet', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Straße"
                          />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={invoice.recipientCity || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'recipientCity', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="PLZ Ort"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">USt-Id / Steuernummer</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.taxId || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'taxId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="USt-Id"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'taxId')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={invoice.taxNumber || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'taxNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Steuernummer"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Zahlungsbedingungen / Verwendungszweck</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.paymentTerms || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'paymentTerms', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Zahlungsbedingungen"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'paymentTerms')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={invoice.usage || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'usage', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Verwendungszweck"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Gesamt (Brutto)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.grossTotal || invoice.totalAmount || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'grossTotal', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'grossTotal')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Bank / Konto</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.bankName || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'bankName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            placeholder="Bankname"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'bankName')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                    </div>

                    {/* Additional extracted fields: addresses, items, bank details */}
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lieferant - Adresse (roh)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.vendorAddressRaw || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'vendorAddressRaw', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'vendorAddressRaw')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Empfänger - Adresse (roh)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.recipientAddressRaw || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'recipientAddressRaw', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'recipientAddressRaw')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                    </div>

                    {/* Items / Positionen */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Positionen</label>
                      {invoice.items && invoice.items.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="border px-2 py-1 text-left">Beschreibung</th>
                                <th className="border px-2 py-1">Menge</th>
                                <th className="border px-2 py-1">Preis</th>
                                <th className="border px-2 py-1">Gesamt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoice.items.map((it, idx) => (
                                <tr key={idx} className="odd:bg-white even:bg-gray-50">
                                  <td className="border px-2 py-1">{(it.description || it.raw || JSON.stringify(it))}</td>
                                  <td className="border px-2 py-1 text-center">{it.quantity || it.qty || ''}</td>
                                  <td className="border px-2 py-1 text-right">{it.unitOrPrice || it.amount || ''}</td>
                                  <td className="border px-2 py-1 text-right">{it.lineTotal || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Keine Positionen erkannt</p>
                      )}
                    </div>

                    {/* Bank details */}
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">IBAN</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.iban || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'iban', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'iban')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">BIC</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={invoice.bic || ''}
                            onChange={(e) => updateInvoiceField(invoice.id, 'bic', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                          <button onClick={() => openFeedback(invoice.id, 'bic')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                        </div>
                      </div>
                    </div>

                    {/* OCR Panel toggle and editor */}
                    {/* OCR-Panel: Manuelle Bearbeitung des Rohtexts
                        Dieses Panel erlaubt es, den Rohtext zu sehen und
                        manuell in ein Ziel-Feld zu übertragen. Praktisch
                        solange die automatische Extraktion noch nicht
                        perfekt ist (z. B. bei zweispaltigen Kopfbereichen).
                    */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700">OCR Rohtext</h4>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleOcrPanel(invoice.id)} className="px-3 py-1 text-sm bg-indigo-100 rounded">{ocrPanelOpen[invoice.id] ? 'Verbergen' : 'Anzeigen'}</button>
                          <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(invoice.ocrText || ''); }} className="px-3 py-1 text-sm bg-gray-100 rounded">In Zwischenablage</button>
                        </div>
                      </div>

                      {ocrPanelOpen[invoice.id] && (
                        <div className="border rounded p-3 bg-gray-50">
                          <textarea
                            value={invoice.ocrText || ''}
                            onChange={(e) => updateOcrText(invoice.id, e.target.value)}
                            rows={8}
                            className="w-full border p-2 rounded text-sm font-mono"
                          />

                          <div className="flex gap-2 items-center mt-2">
                            <label className="text-sm">In Feld kopieren:</label>
                            <select value={ocrSelectedField[invoice.id] || ''} onChange={(e) => setOcrSelectedField(prev => ({ ...prev, [invoice.id]: e.target.value }))} className="border px-2 py-1 text-sm">
                              <option value="">-- Feld wählen --</option>
                              <option value="vendor">Lieferant/Name</option>
                              <option value="vendorAddressRaw">Lieferant Adresse (roh)</option>
                              <option value="recipientName">Empfänger/Name</option>
                              <option value="recipientAddressRaw">Empfänger Adresse (roh)</option>
                              <option value="iban">IBAN</option>
                              <option value="bic">BIC</option>
                              <option value="totalAmount">Gesamtbetrag</option>
                              <option value="items">Positionen (JSON)</option>
                            </select>
                            <button onClick={() => applyOcrToField(invoice.id)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Übernehmen</button>
                            <button onClick={() => updateOcrText(invoice.id, '')} className="px-3 py-1 bg-red-100 rounded text-sm">Leeren</button>
                          </div>

                          <p className="text-xs text-gray-500 mt-2">Tipp: Markieren, kopieren und manuell in Felder einfügen für gezielte Korrekturen.</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">Vertrauenswert: <span className="font-semibold">{invoice.confidence}%</span></span>
                        {invoice.verified && (
                          <div className="flex items-center text-green-600">
                            <CheckCircle size={20} className="mr-1" />
                            Verifiziert
                          </div>
                        )}
                      </div>
                      {!invoice.verified && (
                        <button
                          onClick={() => verifyInvoice(invoice.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
                        >
                          Verifizieren
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Training Tab */}
        {activeTab === 'training' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Überwachtes Lernen</h3>
              <p className="text-gray-600 mb-4">Überprüfte Rechnungen werden zur Verbesserung des Modells verwendet</p>
            </div>

            {invoices.filter(inv => inv.verified).length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded">
                <Settings size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">Bitte verifizieren Sie zuerst Rechnungen in der Überprüfungs-Registerkarte</p>
              </div>
            ) : (
              <div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                  <p className="text-indigo-900 font-semibold">Trainingsfortschritt</p>
                  <div className="mt-2 bg-indigo-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all"
                      style={{ width: `${(invoices.filter(inv => inv.verified).length / Math.max(invoices.length, 1)) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-indigo-800 mt-2">
                    {invoices.filter(inv => inv.verified).length} von {invoices.length} Rechnungen verifiziert
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800">Erkannte Muster:</h4>
                  <div className="bg-gray-50 p-4 rounded space-y-2">
                    <p className="text-gray-700">✓ Durchschnittlicher Vertrauenswert: {(invoices.reduce((acc, inv) => acc + parseFloat(inv.confidence), 0) / invoices.length).toFixed(1)}%</p>
                    <p className="text-gray-700">✓ Klassifizierung: {invoices.filter(inv => inv.type === 'Ausgangsrechnung').length} Ausgang, {invoices.filter(inv => inv.type === 'Eingangsrechnung').length} Eingang</p>
                    <p className="text-gray-700">✓ Verifizierte Rechnungen: {invoices.filter(inv => inv.verified).length}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            {invoices.length === 0 ? (
              <div className="text-center py-12">
                <Download size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 text-lg">Keine Rechnungen zum Exportieren</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Exportoptionen</h3>
                  <div className="space-y-3">
                    <button
                      onClick={exportToExcel}
                      className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center"
                    >
                      <Download className="mr-2" size={20} />
                      Als CSV/Excel exportieren
                    </button>
                    <button
                      onClick={exportFullData}
                      className="w-full px-6 py-3 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 transition flex items-center justify-center"
                    >
                      <Download className="mr-2" size={20} />
                      Vollständige Daten als JSON
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-900 font-semibold mb-2">Export-Übersicht</p>
                  <p className="text-blue-800 text-sm">Insgesamt: <span className="font-semibold">{invoices.length}</span> Rechnungen</p>
                  <p className="text-blue-800 text-sm">Verifiziert: <span className="font-semibold">{invoices.filter(inv => inv.verified).length}</span></p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Demo entfernt: kein Demo-UI wird angezeigt */}

        {/* Feedback Modal */}
        {showFeedbackModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-xl">
              <h3 className="text-lg font-semibold mb-2">Fehler melden</h3>
              <p className="text-sm text-gray-600 mb-4">Feld: <span className="font-medium">{fbField}</span></p>

              <div className="grid grid-cols-1 gap-3 mb-3">
                <label className="text-sm">Erkannten Text (wurde erfasst)</label>
                <input className="border px-2 py-1" value={fbDetectedText} onChange={e => setFbDetectedText(e.target.value)} />

                <label className="text-sm">Korrektur (wie es sein sollte)</label>
                <input className="border px-2 py-1" value={fbCorrectText} onChange={e => setFbCorrectText(e.target.value)} />

                <label className="text-sm">Seite (1-basiert)</label>
                <input type="number" min="1" className="border px-2 py-1" value={fbPage} onChange={e => setFbPage(parseInt(e.target.value || '1'))} />

                <label className="text-sm">Bounding Box (x, y, width, height)</label>
                <div className="flex gap-2">
                  <input placeholder="x" className="border px-2 py-1" value={fbBBox.x} onChange={e => setFbBBox({...fbBBox, x: e.target.value})} />
                  <input placeholder="y" className="border px-2 py-1" value={fbBBox.y} onChange={e => setFbBBox({...fbBBox, y: e.target.value})} />
                  <input placeholder="width" className="border px-2 py-1" value={fbBBox.width} onChange={e => setFbBBox({...fbBBox, width: e.target.value})} />
                  <input placeholder="height" className="border px-2 py-1" value={fbBBox.height} onChange={e => setFbBBox({...fbBBox, height: e.target.value})} />
                </div>

                <label className="text-sm">Fehlerart</label>
                <select value={fbErrorType} onChange={e => setFbErrorType(e.target.value)} className="border px-2 py-1">
                  <option value="ocr">OCR Fehler (textuell falsch erkannt)</option>
                  <option value="nlp">NLP/KI Fehler (falsch zugeordnet)</option>
                </select>

                <label className="text-sm">Exportformat</label>
                <select value={fbFormat} onChange={e => setFbFormat(e.target.value)} className="border px-2 py-1">
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowFeedbackModal(false)} className="px-4 py-2">Abbrechen</button>
                <button onClick={submitFeedback} className="px-4 py-2 bg-indigo-600 text-white rounded">Absenden & Herunterladen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceApp;
