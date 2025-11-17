import React, { useState } from 'react';
import { Upload, Download, Settings, CheckCircle, AlertCircle, Eye } from 'lucide-react';
// Demo component removed — demo functionality disabled

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

  // load company profile
  React.useEffect(() => {
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

  // when entering edit mode, seed form fields
  React.useEffect(() => {
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

  // OCR + NLP processing: upload file to backend and fetch prediction
  const processInvoice = async (file) => {
    try {
      // Upload file to backend OCR endpoint
      const form = new FormData();
      form.append('file', file);

      const ocrResp = await fetch('/api/ocr', { method: 'POST', body: form });
      const ocrJson = await ocrResp.json();

      const ocrText = ocrJson && ocrJson.ocrText ? ocrJson.ocrText : '';

      // Call NLP extract endpoint with OCR text
      const extractResp = await fetch('/nlp/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText })
      });
      const extractJson = await extractResp.json();

      const pred = (extractJson && extractJson.prediction) || {};

      const invoice = {
        id: Date.now(),
        fileName: file.name,
        uploadDate: new Date().toLocaleDateString('de-DE'),
        type: pred.classification || 'Unbestimmt',
        invoiceNumber: pred.extractedData && pred.extractedData.invoiceNumber ? pred.extractedData.invoiceNumber : (ocrJson.savedFile || `RG-${Math.floor(Math.random() * 10000)}`),
        date: pred.extractedData && pred.extractedData.date ? pred.extractedData.date : new Date().toLocaleDateString('de-DE'),
        // vendor/recipient: backend returns structured objects { name, street, zip_code, city, raw }
        vendor: (pred.extractedData && pred.extractedData.vendor && (pred.extractedData.vendor.name || pred.extractedData.vendor.raw)) || 'unbekannt',
        recipient: (pred.extractedData && pred.extractedData.recipient && (pred.extractedData.recipient.name || pred.extractedData.recipient.raw)) || undefined,
        taxId: pred.extractedData && pred.extractedData.taxId ? pred.extractedData.taxId : undefined,
        items: pred.extractedData && pred.extractedData.items ? pred.extractedData.items : [],
        taxBreakdown: pred.extractedData && pred.extractedData.taxBreakdown ? pred.extractedData.taxBreakdown : [],
        vatAmount: pred.extractedData && pred.extractedData.vatAmount ? pred.extractedData.vatAmount : undefined,
        totalAmount: pred.extractedData && pred.extractedData.grossTotal ? pred.extractedData.grossTotal : (pred.extractedData && pred.extractedData.total ? pred.extractedData.total : '0.00'),
        currency: pred.extractedData && pred.extractedData.currency ? pred.extractedData.currency : 'EUR',
        taxAmount: '0.00',
        description: 'Automatisch erfasst',
        confidence: extractJson.prediction && extractJson.prediction.confidence ? (extractJson.prediction.confidence*100).toFixed(0) : '80',
        verified: false,
        corrections: {},
        // keep original prediction for feedback
        prediction: pred,
        ocrTextSample: (ocrText || '').slice(0,500)
      };

      setInvoices(prev => [...prev, invoice]);
      setTrainingData(prev => [...prev, invoice]);
    } catch (err) {
      console.error('processInvoice error', err);
      // fallback to previous simulation if backend fails
      const simulatedData = {
        id: Date.now(),
        fileName: file.name,
        uploadDate: new Date().toLocaleDateString('de-DE'),
        type: Math.random() > 0.5 ? 'Ausgangsrechnung' : 'Eingangsrechnung',
        invoiceNumber: `RG-${Math.floor(Math.random() * 10000)}`,
        date: new Date().toLocaleDateString('de-DE'),
        vendor: ['Musterfirma GmbH', 'ABC Lieferant', 'XYZ Services', 'Tech Solutions'][Math.floor(Math.random() * 4)],
        totalAmount: (Math.random() * 5000 + 100).toFixed(2),
        currency: 'EUR',
        taxAmount: (Math.random() * 1000).toFixed(2),
        description: 'Automatisch erfasst (Fallback)',
        items: [],
        confidence: (Math.random() * 30 + 70).toFixed(1),
        verified: false,
        corrections: {}
      };
      setInvoices(prev => [...prev, simulatedData]);
      setTrainingData(prev => [...prev, simulatedData]);
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
    setInvoices(invoices.map(inv => 
      inv.id === invoiceId 
        ? { ...inv, [field]: value, corrections: { ...inv.corrections, [field]: value } }
        : inv
    ));
  };

  // send classification override as feedback to backend
  const sendClassificationFeedback = async (invoice, newClassification) => {
    try {
      const original = invoice.prediction || { extractedData: { invoiceNumber: invoice.invoiceNumber, date: invoice.date, total: invoice.totalAmount }, classification: invoice.type };
      const edited = { ...(original || {}), classification: newClassification };

      // optimistically update prediction on frontend
      setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, type: newClassification, prediction: edited } : i));

      await fetch('/nlp/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: null, invoiceId: invoice.id, originalPrediction: original, editedPrediction: edited, editorId: 'user-local' })
      });
    } catch (e) {
      console.error('sendClassificationFeedback error', e);
    }
  };

  const verifyInvoice = (invoiceId) => {
    setInvoices(invoices.map(inv =>
      inv.id === invoiceId ? { ...inv, verified: true } : inv
    ));
  };

  const exportToExcel = () => {
    const headers = ['Rechnungsnummer', 'Typ', 'Datum', 'Lieferant', 'Gesamtbetrag', 'Währung', 'Steuerbetrag', 'Vertrauenswert', 'Status'];
    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.type,
      inv.date,
      inv.vendor,
      inv.totalAmount,
      inv.currency,
      inv.taxAmount,
      inv.confidence + '%',
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
      gesamtbetrag: inv.totalAmount,
      currency: inv.currency,
      steuerbetrag: inv.taxAmount,
      beschreibung: inv.description,
      vertrauenswert: inv.confidence,
      verifiziert: inv.verified,
      artikel: inv.items
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen_vollständig_${Date.now()}.json`;
    a.click();
  };

  // Feedback (error reporting) state & helpers
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
      // simple XML serialization
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
          {company && (
            <div className="mt-3 text-sm text-gray-700">
              <div className="font-medium">Unternehmer: {company.name}</div>
              <div>{company.street}, {company.zip_code} {company.city}</div>
              <div className="mt-1">
                <button onClick={() => setEditingCompany(true)} className="px-3 py-1 bg-gray-200 rounded text-sm">Firma bearbeiten</button>
              </div>
              {editingCompany && (
                <div className="mt-3 p-3 bg-gray-50 border rounded">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input className="px-2 py-1 border rounded" placeholder="Name" value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
                    <input className="px-2 py-1 border rounded" placeholder="Straße" value={companyStreet} onChange={(e)=>setCompanyStreet(e.target.value)} />
                    <input className="px-2 py-1 border rounded" placeholder="PLZ" value={companyZip} onChange={(e)=>setCompanyZip(e.target.value)} />
                    <input className="px-2 py-1 border rounded" placeholder="Stadt" value={companyCity} onChange={(e)=>setCompanyCity(e.target.value)} />
                    <input className="px-2 py-1 border rounded md:col-span-2" placeholder="USt‑Id" value={companyVat} onChange={(e)=>setCompanyVat(e.target.value)} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={saveCompany} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Speichern</button>
                    <button onClick={()=>setEditingCompany(false)} className="px-3 py-1 bg-gray-200 rounded text-sm">Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          )}
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
          {/* Demo tab removed */}
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
                        <div className="flex gap-2">
                          <select
                            value={invoice.type}
                            onChange={(e) => { updateInvoiceField(invoice.id, 'type', e.target.value); sendClassificationFeedback(invoice, e.target.value); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          >
                            <option>Eingangsrechnung</option>
                            <option>Ausgangsrechnung</option>
                          </select>
                          <div className={`px-3 py-1 rounded text-sm font-semibold ${invoice.type === 'Ausgangsrechnung' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'}`}>
                            {invoice.type}
                          </div>
                        </div>
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
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-600">Gesamt: {invoice.totalAmount} {invoice.currency}</div>
                      <div className="flex gap-2">
                        <button onClick={() => verifyInvoice(invoice.id)} className="px-4 py-2 bg-green-500 text-white rounded">Verifizieren</button>
                        <button onClick={() => { setSelectedInvoice(invoice); setShowPreview(true); }} className="px-4 py-2 bg-indigo-500 text-white rounded">Vorschau</button>
                      </div>
                    </div>
                    {/* additional extracted fields */}
                    <div className="mt-4 border-t pt-4">
                      {invoice.recipient && (
                        <div className="mb-2">
                          <div className="text-xs text-gray-500">Leistungsempfänger</div>
                          <div className="text-sm font-medium">{invoice.recipient}</div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Steuernummer / USt‑Id</label>
                          <div className="flex gap-2">
                            <input type="text" value={invoice.taxId || ''} onChange={(e)=> updateInvoiceField(invoice.id, 'taxId', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded" />
                            <button onClick={() => openFeedback(invoice.id, 'taxId')} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Umsatzsteuer</label>
                          <div className="text-sm text-gray-700">{invoice.vatAmount ? invoice.vatAmount + ' ' + invoice.currency : '—'}</div>
                        </div>
                      </div>

                      {invoice.items && invoice.items.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-gray-700 mb-2">Positionen</div>
                          <div className="space-y-2">
                            {invoice.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                <div className="text-sm">
                                  <div className="font-medium">{it.description || it.raw || 'Position'}</div>
                                  <div className="text-xs text-gray-500">Menge: {it.quantity || '-' } • Preis: {it.unitOrPrice || (it.amounts ? it.amounts[0] : '-')}</div>
                                </div>
                                <div className="text-right text-sm font-semibold">{it.lineTotal || (it.amounts ? it.amounts.slice(-1)[0] : '-') } {invoice.currency}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {invoice.taxBreakdown && invoice.taxBreakdown.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-gray-700 mb-2">Steueraufstellung</div>
                          <div className="flex gap-4">
                            {invoice.taxBreakdown.map((t, i) => (
                              <div key={i} className="text-sm text-gray-700">{t.rate}: {t.amount} {invoice.currency}</div>
                            ))}
                          </div>
                        </div>
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
            <p className="text-gray-600">Trainingsmodus — hier können erkannte Dokumente zum Training markiert werden.</p>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex gap-2">
              <button onClick={exportToExcel} className="px-4 py-2 bg-indigo-600 text-white rounded">Exportieren (CSV)</button>
              <button onClick={exportFullData} className="px-4 py-2 bg-gray-200 rounded">Exportieren (JSON)</button>
              <button onClick={() => exportAllFeedbacks('json')} className="px-4 py-2 bg-yellow-400 rounded">Feedbacks (JSON)</button>
              <button onClick={() => exportAllFeedbacks('xml')} className="px-4 py-2 bg-yellow-600 text-white rounded">Feedbacks (XML)</button>
            </div>
          </div>
        )}

        {/* Demo removed: no demo UI rendered */}

        {/* Feedback Modal */}
        {showFeedbackModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Feedback</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold">Feld</label>
                  <div className="text-gray-700">{fbField}</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold">Erkannter Text</label>
                  <input value={fbDetectedText} onChange={(e)=> setFbDetectedText(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-semibold">Korrektur</label>
                  <input value={fbCorrectText} onChange={(e)=> setFbCorrectText(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFbFormat('json')} className={`px-3 py-2 rounded ${fbFormat==='json' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>JSON</button>
                  <button onClick={() => setFbFormat('xml')} className={`px-3 py-2 rounded ${fbFormat==='xml' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>XML</button>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowFeedbackModal(false)} className="px-4 py-2 bg-gray-200 rounded">Abbrechen</button>
                  <button onClick={submitFeedback} className="px-4 py-2 bg-indigo-600 text-white rounded">Senden</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default InvoiceApp;