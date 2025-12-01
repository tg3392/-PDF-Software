import React, { useState } from 'react';
import { ocrUpload, nlpExtract, sendNlpFeedback } from '../lib/api';

// Zentrales Feldschema, das zur Darstellung des dynamischen Formulars verwendet wird
const FIELD_SCHEMA = {
  "INVOICE_NO": { type: 'text', label: 'Rechnungsnummer' },
  "INVOICE_DATE": { type: 'date', label: 'Rechnungsdatum' },
  "SERVICE_DATE": { type: 'date', label: 'Leistungsdatum' },
  "SUPPLIER_NAME": { type: 'text', label: 'Lieferant Name' },
  "SUPPLIER_ADDRESS_STREET": { type: 'text', label: 'Lieferant Straße' },
  "SUPPLIER_ADDRESS_CITY": { type: 'text', label: 'Lieferant Ort' },
  "CUSTOMER_NAME": { type: 'text', label: 'Kunde Name' },
  "CUSTOMER_ADDRESS_STREET": { type: 'text', label: 'Kunde Straße' },
  "CUSTOMER_ADDRESS_CITY": { type: 'text', label: 'Kunde Ort' },
  "VAT_ID": { type: 'text', label: 'USt‑Id' },
  "TAX_ID": { type: 'text', label: 'Steuernummer' },
  "PAYMENT_TERMS": { type: 'text', label: 'Zahlungsbedingungen' },
  "TOTAL_GROSS": { type: 'number', label: 'Gesamt (Brutto)' },
  "IBAN": { type: 'text', label: 'IBAN' },
  "BIC": { type: 'text', label: 'BIC' },
  "BANK_NAME": { type: 'text', label: 'Bankname' }
};

// Helfer: Aktualisiert ein konkretes NLP-Feld für eine Rechnung
const updateNlpField = (invoices, setInvoices, invoiceId, fieldName, value) => {
  setInvoices(invoices.map(inv => {
    if (inv.id !== invoiceId) return inv;
    const n = { ...(inv.nlp || {} ) };
    const fields = (n.fields || []).map(f => f.name === fieldName ? { ...f, value } : f);
    // if field not present, add it
    if (!fields.find(f => f.name === fieldName)) fields.push({ name: fieldName, value, confidence: 1 });
    n.fields = fields;
    // also update top-level invoice properties for a better UX (keep in sync)
    const updated = { ...inv, nlp: n };
    try {
      switch (fieldName) {
        case 'SUPPLIER_NAME': updated.vendor = value; break;
        case 'SUPPLIER_ADDRESS_STREET': updated.vendorStreet = value; break;
        case 'SUPPLIER_ADDRESS_CITY': updated.vendorCity = value; break;
        case 'IBAN': updated.iban = value; break;
        case 'BIC': updated.bic = value; break;
        case 'INVOICE_DATE': updated.date = value; break;
        case 'INVOICE_NO': updated.invoiceNumber = value; break;
        case 'TOTAL_GROSS': updated.totalAmount = value; break;
        case 'TAX_ID': case 'VAT_ID': updated.taxId = value; break;
        default: break;
      }
    } catch (e) {}
    return updated;
  }));
};

// Helfer: Baue Korrekturen zusammen und sende sie an `/nlp/feedback`
const submitNlpCorrections = async (invoice, setSendingFeedbackIds, setInvoices) => {
  if (!invoice || !invoice.nlp) return;
  const requestId = invoice.nlp.requestId;
  const original = invoice.nlp.originalFields || [];
  const current = invoice.nlp.fields || [];
  const corrections = [];
  current.forEach(c => {
    const orig = original.find(o => o.name === c.name);
    const origVal = orig ? (orig.value || '') : '';
    const curVal = c.value || '';
    if (String(origVal) !== String(curVal)) corrections.push({ name: c.name, value: curVal });
  });

  if (corrections.length === 0) return { ok: true, message: 'no changes' };

  try {
    setSendingFeedbackIds(ids => [...ids, invoice.id]);
    const resp = await sendNlpFeedback({ requestId, corrections });
    // optimistic: attach corrections to invoice
    setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, corrections: { ...(i.corrections||{}), nlpCorrections: corrections } } : i));
    return resp;
  } catch (e) {
    console.error('submitNlpCorrections error', e);
    throw e;
  } finally {
    setSendingFeedbackIds(ids => ids.filter(x => x !== invoice.id));
  }
};
import { Upload, Download, Settings, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal';
// Demo-Komponente entfernt — Demo-Funktionalität deaktiviert

const InvoiceApp = () => {
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [trainingMode, setTrainingMode] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [trainingData, setTrainingData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [company, setCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyStreet, setCompanyStreet] = useState('');
  const [companyZip, setCompanyZip] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyVat, setCompanyVat] = useState('');

  // Lade Firmenprofil
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

  // Beim Wechsel in den Bearbeitungsmodus: Formularfelder vorbefüllen
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

  // OCR- und NLP-Verarbeitung: Datei an Backend hochladen und Vorhersage abfragen
  const processInvoice = async (file) => {
    try {
      setIsUploading(true);
      // Datei an OCR-Endpunkt im Backend hochladen
      const form = new FormData();
      form.append('file', file);
      const ocrJson = await ocrUpload(form);
      const ocrText = (ocrJson && ocrJson.ocrText) ? ocrJson.ocrText : '';

      // NLP-Extraktion mit strukturierter `ocrText`-Nutzlast aufrufen
      const requestId = `req-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const ocrPayload = {
        requestId,
        ocrText: {
          metadata: { filename: file.name },
          pages: [ { page_number: 1, full_text: typeof ocrText === 'string' ? ocrText : (ocrText && ocrText.pages && ocrText.pages[0] && ocrText.pages[0].full_text) || '' } ]
        }
      };
      const extractJson = await nlpExtract(ocrPayload);

      // Verarbeite die Antwort des Extractors
      const ext = extractJson || {};
      const data = ext.data || {};
      const fields = Array.isArray(data.fields) ? data.fields : [];

      // Das zentrale Schema wird im Client verwendet; speichere die Antwort im Rechnungszustand
      const item = {
        id: Date.now(),
        fileName: file.name,
        type: data.type || 'UNKNOWN',
        invoiceNumber: fields.find(f => f.name === 'INVOICE_NO')?.value || `RG-${Math.floor(Math.random()*10000)}`,
        date: fields.find(f => f.name === 'INVOICE_DATE')?.value || new Date().toISOString().slice(0,10),
        vendor: fields.find(f => f.name === 'SUPPLIER_NAME')?.value || 'unknown',
        taxId: fields.find(f => f.name === 'TAX_ID' || f.name === 'VAT_ID')?.value || '',
        recipient: fields.find(f => f.name === 'RECIPIENT_NAME')?.value || '',
        vatAmount: fields.find(f => f.name === 'VAT_AMOUNT')?.value || '',
        totalAmount: fields.find(f => f.name === 'TOTAL_GROSS')?.value || '0.00',
        vendorStreet: fields.find(f => f.name === 'SUPPLIER_ADDRESS_STREET')?.value || '',
        vendorCity: fields.find(f => f.name === 'SUPPLIER_ADDRESS_CITY')?.value || '',
        iban: fields.find(f => f.name === 'IBAN')?.value || '',
        bic: fields.find(f => f.name === 'BIC')?.value || '',
        currency: 'EUR',
        confidence: 0.8,
        verified: false,
        corrections: {},
        nlp: {
          requestId: ext.requestId || requestId,
          type: data.type || 'UNKNOWN',
          fields: fields.map(f => ({ name: f.name, value: f.value, confidence: f.confidence })),
          originalFields: fields.map(f => ({ name: f.name, value: f.value }))
        }
      };

      setInvoices(prev => [...prev, item]);
      setTrainingData(prev => [...prev, item]);
    } catch (err) {
      console.error('processInvoice error', err);
    } finally {
      setIsUploading(false);
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

  // Klassifikations-Override als Feedback an das Backend senden (optimistische Aktualisierung + Rücksetz-Logik)
  const sendClassificationFeedback = async (invoice, newClassification) => {
    try {
      const original = invoice.prediction || { extractedData: { invoiceNumber: invoice.invoiceNumber, date: invoice.date, total: invoice.totalAmount }, classification: invoice.type };
      const edited = { ...(original || {}), classification: newClassification };

      // optimistische Aktualisierung mit Rücksetz-Logik
      setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, type: newClassification, prediction: edited } : i));
      setSendingFeedbackIds(ids => [...ids, invoice.id]);

      try {
        const resp = await fetch('/nlp/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: null, invoiceId: invoice.id, originalPrediction: original, editedPrediction: edited, editorId: 'user-local' })
        });
        if (!resp.ok) throw new Error('Feedback send failed');
      } catch (e) {
        // rollback
        console.error('sendClassificationFeedback error', e);
        setInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, type: invoice.type, prediction: original } : i));
        alert('Feedback konnte nicht gesendet werden. Änderung zurückgesetzt.');
      } finally {
        setSendingFeedbackIds(ids => ids.filter(x => x !== invoice.id));
      }
    } catch (e) {
      console.error('sendClassificationFeedback outer error', e);
    }
  };

  const verifyInvoice = (invoiceId) => {
    setInvoices(invoices.map(inv =>
      inv.id === invoiceId ? { ...inv, verified: true } : inv
    ));
  };

  // Erzeuge ein Payload aus der Rechnung unter Verwendung der aktuellen NLP-Felder (Edits aus dem NLP-Formular haben Vorrang)
  const buildInvoicePayload = (inv) => {
    const nlpMap = (inv.nlp && Array.isArray(inv.nlp.fields)) ? Object.fromEntries(inv.nlp.fields.map(f => [f.name, f.value])) : {};
    const vendorObj = {
      name: nlpMap['SUPPLIER_NAME'] || inv.vendor || '',
      street: nlpMap['SUPPLIER_ADDRESS_STREET'] || inv.vendorStreet || '',
      zip_code: (nlpMap['SUPPLIER_ADDRESS_CITY'] || inv.vendorCity || '').split(' ')[0] || '',
      city: (nlpMap['SUPPLIER_ADDRESS_CITY'] || inv.vendorCity || '').split(' ').slice(1).join(' ') || '',
      iban: nlpMap['IBAN'] || inv.iban || '',
      bic: nlpMap['BIC'] || inv.bic || ''
    };

    return {
      vendor: vendorObj,
      invoiceNumber: nlpMap['INVOICE_NO'] || inv.invoiceNumber,
      date: nlpMap['INVOICE_DATE'] || inv.date,
      total: nlpMap['TOTAL_GROSS'] || inv.totalAmount,
      currency: inv.currency || 'EUR',
      raw: { nlp: inv.nlp || null, corrections: inv.corrections || {} }
    };
  };

  const saveInvoice = async (inv) => {
    try {
      const payload = buildInvoicePayload(inv);
      const resp = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await resp.json();
      if (j && j.ok) {
        // annotate saved id on invoice in local state
        setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, savedId: j.id || j.invoiceId || null } : i));
        alert('Rechnung gespeichert');
      } else {
        alert('Speichern fehlgeschlagen');
      }
    } catch (e) {
      console.error('saveInvoice error', e);
      alert('Fehler beim Speichern');
    }
  };

  const exportToExcel = () => {
    // Verbesserter CSV-Export: semikolon-Separator, UTF-8 BOM, formatierte Zahlen/Daten, freundliche Header
    const delimiter = ';';
    const headers = ['Datei', 'Rechnungsnummer', 'Typ', 'Datum', 'Lieferant', 'Straße', 'Ort', 'IBAN', 'BIC', 'Gesamtbetrag', 'Währung', 'USt/Betrag', 'Vertrauenswert', 'Status', 'Beschreibung'];

    const fmtNumber = (v) => {
      if (v === undefined || v === null || v === '') return '';
      const n = Number(String(v).replace(',', '.'));
      if (Number.isNaN(n)) return String(v);
      return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    };

    const fmtDate = (d) => {
      if (!d) return '';
      // accept ISO or localized strings; try to create Date
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      const day = String(dt.getDate()).padStart(2,'0');
      const month = String(dt.getMonth()+1).padStart(2,'0');
      const year = dt.getFullYear();
      return `${day}.${month}.${year}`;
    };

    // build rows with formatted values
    const rows = invoices.map(inv => {
      const nlpMap = (inv.nlp && Array.isArray(inv.nlp.fields)) ? Object.fromEntries(inv.nlp.fields.map(f => [f.name, f.value])) : {};
      const invoiceNo = nlpMap['INVOICE_NO'] || inv.invoiceNumber || '';
      const date = fmtDate(nlpMap['INVOICE_DATE'] || inv.date || '');
      const vendorName = nlpMap['SUPPLIER_NAME'] || inv.vendor || '';
      const vendorStreet = nlpMap['SUPPLIER_ADDRESS_STREET'] || inv.vendorStreet || '';
      const vendorCity = nlpMap['SUPPLIER_ADDRESS_CITY'] || inv.vendorCity || '';
      const iban = nlpMap['IBAN'] || inv.iban || '';
      const bic = nlpMap['BIC'] || inv.bic || '';
      const total = fmtNumber(nlpMap['TOTAL_GROSS'] || inv.totalAmount || '');
      const tax = fmtNumber(inv.taxAmount || '');
      const confidence = inv.confidence ? Number(inv.confidence).toFixed(2) : '';
      const cols = [
        inv.fileName || '',
        invoiceNo,
        inv.type || '',
        date,
        vendorName,
        vendorStreet,
        vendorCity,
        iban,
        bic,
        total,
        inv.currency || 'EUR',
        tax,
        confidence,
        (inv.verified ? 'Verifiziert' : 'Ungeprüft'),
        inv.description || ''
      ];
      // quote and escape
      return cols.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(delimiter);
    });

    // optional summary row: Anzahl Rechnungen und Summe
    const insgesamt = invoices.reduce((s, inv) => s + (Number(String((inv.nlp && Array.isArray(inv.nlp.fields) ? (Object.fromEntries(inv.nlp.fields.map(f=>[f.name,f.value]))['TOTAL_GROSS']) : inv.totalAmount) || '0').replace(',','.')) || 0), 0);
    const summaryRow = ['','', '', '', '','', '','', '', new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(insgesamt), '', '', '', '', ''];

    const BOM = '\uFEFF';
    const csvLines = [headers.map(h => '"' + h + '"').join(delimiter), ...rows, '""' + delimiter + '""' + delimiter + '"Gesamt"' + delimiter + '""' + delimiter + '""' + delimiter + '""' + delimiter + summaryRow.join(delimiter)];
    const csvContent = BOM + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const exportFullData = () => {
    // Export full internal invoice representation including NLP payload for training/backup
    const data = invoices.map(inv => {
      const nlpMap = (inv.nlp && Array.isArray(inv.nlp.fields)) ? Object.fromEntries(inv.nlp.fields.map(f => [f.name, f.value])) : {};
      const vendorObj = {
        name: nlpMap['SUPPLIER_NAME'] || inv.vendor || '',
        street: nlpMap['SUPPLIER_ADDRESS_STREET'] || inv.vendorStreet || '',
        city: nlpMap['SUPPLIER_ADDRESS_CITY'] || inv.vendorCity || '',
        iban: nlpMap['IBAN'] || inv.iban || '',
        bic: nlpMap['BIC'] || inv.bic || ''
      };
      return {
        id: inv.id,
        fileName: inv.fileName,
        type: inv.type,
        invoiceNumber: nlpMap['INVOICE_NO'] || inv.invoiceNumber,
        date: nlpMap['INVOICE_DATE'] || inv.date,
        vendor: vendorObj,
        totalAmount: nlpMap['TOTAL_GROSS'] || inv.totalAmount,
        currency: inv.currency || 'EUR',
        taxAmount: inv.taxAmount,
        description: inv.description,
        items: inv.items || [],
        confidence: inv.confidence,
        verified: inv.verified,
        corrections: inv.corrections || {},
        nlp: inv.nlp || null,
        raw: inv.raw || null
      };
    });

    const jsonStr = JSON.stringify({ exportedAt: new Date().toISOString(), invoices: data }, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rechnungen_vollstaendig_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
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
  const [sendingFeedbackIds, setSendingFeedbackIds] = useState([]);

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
      const blob = new Blob([JSON.stringify(feedback, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_${feedback.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      // simple XML serialization
      const xmlParts = [];
      xmlParts.push('<?xml version="1.0" encoding="utf-8"?>');
      xmlParts.push('<feedback>');
      xmlParts.push(`  <id>${feedback.id}</id>`);
      xmlParts.push(`  <invoiceId>${escapeXml(feedback.invoiceId)}</invoiceId>`);
      xmlParts.push(`  <field>${escapeXml(feedback.field)}</field>`);
      xmlParts.push(`  <detectedText>${escapeXml(feedback.detectedText)}</detectedText>`);
      xmlParts.push(`  <correctText>${escapeXml(feedback.correctText)}</correctText>`);
      xmlParts.push(`  <page>${escapeXml(feedback.page)}</page>`);
      xmlParts.push('  <bbox>');
      xmlParts.push(`    <x>${escapeXml(feedback.bbox.x)}</x>`);
      xmlParts.push(`    <y>${escapeXml(feedback.bbox.y)}</y>`);
      xmlParts.push(`    <width>${escapeXml(feedback.bbox.width)}</width>`);
      xmlParts.push(`    <height>${escapeXml(feedback.bbox.height)}</height>`);
      xmlParts.push('  </bbox>');
      xmlParts.push(`  <errorType>${escapeXml(feedback.errorType)}</errorType>`);
      xmlParts.push(`  <timestamp>${escapeXml(feedback.timestamp)}</timestamp>`);
      xmlParts.push('</feedback>');
      const xml = xmlParts.join('\n');
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_${feedback.id}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }

    setShowFeedbackModal(false);
  };

  const escapeXml = (unsafe) => {
    if (unsafe === undefined || unsafe === null) return '';
    return String(unsafe).replace(/[<>&'\"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return '';
      }
    });
  };

  const exportAllFeedbacks = (format = 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(feedbacks, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_feedbacks_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      const parts = [];
      parts.push('<?xml version="1.0" encoding="utf-8"?>');
      parts.push('<feedbacks>');
      feedbacks.forEach(fb => {
        parts.push('  <feedback>');
        parts.push(`    <id>${escapeXml(fb.id)}</id>`);
        parts.push(`    <invoiceId>${escapeXml(fb.invoiceId)}</invoiceId>`);
        parts.push(`    <field>${escapeXml(fb.field)}</field>`);
        parts.push(`    <detectedText>${escapeXml(fb.detectedText)}</detectedText>`);
        parts.push(`    <correctText>${escapeXml(fb.correctText)}</correctText>`);
        parts.push(`    <page>${escapeXml(fb.page)}</page>`);
        parts.push('    <bbox>');
        parts.push(`      <x>${escapeXml(fb.bbox.x)}</x>`);
        parts.push(`      <y>${escapeXml(fb.bbox.y)}</y>`);
        parts.push(`      <width>${escapeXml(fb.bbox.width)}</width>`);
        parts.push(`      <height>${escapeXml(fb.bbox.height)}</height>`);
        parts.push('    </bbox>');
        parts.push(`    <errorType>${escapeXml(fb.errorType)}</errorType>`);
        parts.push(`    <timestamp>${escapeXml(fb.timestamp)}</timestamp>`);
        parts.push('  </feedback>');
      });
      parts.push('</feedbacks>');
      const xml = parts.join('\n');
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all_feedbacks_${Date.now()}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
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
                      {/* Dynamic NLP fields form based on central schema */}
                      {invoice.nlp && (
                        <div className="mb-4">
                          <div className="text-sm font-semibold text-gray-700 mb-2">Erkannte Felder (NLP)</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.keys(FIELD_SCHEMA).map((key) => {
                              const schema = FIELD_SCHEMA[key];
                              const field = (invoice.nlp.fields || []).find(f => f.name === key);
                              const value = field ? (field.value || '') : '';
                              return (
                                <div key={key}>
                                  <label className="block text-sm font-semibold text-gray-700 mb-1">{schema.label}</label>
                                  <div className="flex gap-2">
                                    <input
                                      type={schema.type === 'date' ? 'date' : (schema.type === 'number' ? 'number' : 'text')}
                                      value={value}
                                      onChange={(e) => updateNlpField(invoices, setInvoices, invoice.id, key, e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded"
                                    />
                                    <button onClick={() => openFeedback(invoice.id, key)} className="px-3 py-2 bg-yellow-400 rounded text-sm">Feedback</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button onClick={async () => { try { await submitNlpCorrections(invoice, setSendingFeedbackIds, setInvoices); alert('Korrekturen gesendet'); } catch(e){ alert('Fehler beim Senden'); } }} className="px-4 py-2 bg-indigo-600 text-white rounded">Korrekturen speichern</button>
                            <button onClick={() => saveInvoice(invoice)} className="px-4 py-2 bg-green-600 text-white rounded">Speichern</button>
                          </div>
                        </div>
                      )}
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

        {/* Demo entfernt: kein Demo-UI wird angezeigt */}

        {/* Feedback Modal */}
        <FeedbackModal
          show={showFeedbackModal}
          fbField={fbField}
          fbDetectedText={fbDetectedText}
          setFbDetectedText={setFbDetectedText}
          fbCorrectText={fbCorrectText}
          setFbCorrectText={setFbCorrectText}
          fbPage={fbPage}
          setFbPage={setFbPage}
          fbBBox={fbBBox}
          setFbBBox={setFbBBox}
          fbErrorType={fbErrorType}
          setFbErrorType={setFbErrorType}
          fbFormat={fbFormat}
          setFbFormat={setFbFormat}
          onCancel={() => setShowFeedbackModal(false)}
          onSubmit={submitFeedback}
        />

      </div>
    </div>
  );
};

export default InvoiceApp;