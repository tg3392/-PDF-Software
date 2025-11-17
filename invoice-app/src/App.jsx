import React, { useState } from 'react';
import { Upload, Download, Settings, CheckCircle, AlertCircle, Eye } from 'lucide-react';
// Demo/Test component removed — demo functionality disabled

const InvoiceApp = () => {
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [trainingMode, setTrainingMode] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [trainingData, setTrainingData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  // Simulierte OCR und KI-Verarbeitung
  const processInvoice = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Simulierte OCR - in echter App würde hier ein OCR-Service wie Tesseract verwendet
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
        description: 'Automatisch erfasst',
        items: [
          { description: 'Produkt/Service 1', amount: (Math.random() * 2000).toFixed(2), quantity: Math.floor(Math.random() * 10) + 1 },
          { description: 'Produkt/Service 2', amount: (Math.random() * 1500).toFixed(2), quantity: Math.floor(Math.random() * 8) + 1 }
        ],
        confidence: (Math.random() * 30 + 70).toFixed(1),
        verified: false,
        corrections: {}
      };

      setInvoices(prev => [...prev, simulatedData]);
      setTrainingData(prev => [...prev, simulatedData]);
    };
    reader.readAsArrayBuffer(file);
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
      währung: inv.currency,
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

        {/* Demo removed: no demo UI rendered */}

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
