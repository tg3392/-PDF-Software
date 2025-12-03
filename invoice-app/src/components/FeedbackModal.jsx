import React from 'react';

export default function FeedbackModal({
  show,
  fbField,
  fbDetectedText,
  setFbDetectedText,
  fbCorrectText,
  setFbCorrectText,
  fbPage,
  setFbPage,
  fbBBox,
  setFbBBox,
  fbErrorType,
  setFbErrorType,
  fbFormat,
  setFbFormat,
  onCancel,
  onSubmit
}) {
  if (!show) return null;

  return (
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
            <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded">Abbrechen</button>
            <button onClick={onSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded">Senden</button>
          </div>
        </div>
      </div>
    </div>
  );
}
