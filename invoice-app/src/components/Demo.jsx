import React, { useState } from 'react';
import { Upload, Download } from 'lucide-react';

const DemoComponent = () => {
  const [invoices, setInvoices] = useState([]);

  const processInvoice = (file) => {
    const simulated = { id: Date.now(), fileName: file.name, invoiceNumber: `RG-${Math.floor(Math.random()*10000)}` };
    setInvoices(prev => [...prev, simulated]);
  };

  const handleFile = (e) => {
    const files = e.target.files;
    Array.from(files).forEach(f => processInvoice(f));
  };

  return (
    <div>
      <div className="border-2 border-dashed p-6 rounded">
        <input id="demoFile" type="file" accept=".pdf" onChange={handleFile} className="hidden" />
        <label htmlFor="demoFile" className="cursor-pointer inline-flex items-center gap-2">
          <Upload /> PDF hochladen (Demo)
        </label>
      </div>
      <div className="mt-4">
        <h4 className="font-semibold">Demo-Rechnungen</h4>
        <ul>
          {invoices.map(i => <li key={i.id}>{i.fileName} — {i.invoiceNumber}</li>)}
        </ul>
      </div>
    </div>
  );
};

export default DemoComponent;
