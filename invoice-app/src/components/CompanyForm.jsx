import React, { useEffect, useState } from 'react';

export default function CompanyForm() {
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [vat, setVat] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/company');
        const j = await r.json();
        if (j && j.company) {
          setCompany(j.company);
        } else {
          setCompany(null);
        }
      } catch (e) {
        console.error('CompanyForm: failed to load company', e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (editing && company) {
      setName(company.name || '');
      setStreet(company.street || '');
      setZip(company.zip_code || '');
      setCity(company.city || '');
      setVat(company.vat_id || '');
    }
  }, [editing, company]);

  const save = async () => {
    try {
      const payload = { name, street, zip_code: zip, city, vat_id: vat };
      const r = await fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j && (j.ok || j.created || j.updated)) {
        // reload
        const rr = await fetch('/api/company');
        const jj = await rr.json();
        if (jj && jj.company) setCompany(jj.company);
        setEditing(false);
      }
    } catch (e) {
      console.error('CompanyForm: save failed', e);
    }
  };

  if (!company && !editing) {
    return (
      <div className="mt-4">
        <button onClick={() => setEditing(true)} className="px-4 py-2 bg-indigo-600 text-white rounded">Firma anlegen</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mt-4 space-y-2">
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="border p-2 rounded w-full" />
          <input value={vat} onChange={e => setVat(e.target.value)} placeholder="USt-Id" className="border p-2 rounded w-48" />
        </div>
        <div className="flex gap-2">
          <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Straße" className="border p-2 rounded w-1/2" />
          <input value={zip} onChange={e => setZip(e.target.value)} placeholder="PLZ" className="border p-2 rounded w-24" />
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ort" className="border p-2 rounded w-1/4" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-4 py-2 bg-green-600 text-white rounded">Speichern</button>
          <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-200 rounded">Abbrechen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-600">Firma</div>
        <div className="font-medium">{company.name || '—'}</div>
        <div className="text-sm text-gray-500">{company.street || ''} {company.zip_code || ''} {company.city || ''}</div>
      </div>
      <div>
        <button onClick={() => setEditing(true)} className="px-3 py-1 bg-white border rounded">Bearbeiten</button>
      </div>
    </div>
  );
}
