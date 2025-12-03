"""Convert JSONL data into spaCy DocBin format."""

import json
import sys
import spacy
from spacy.tokens import DocBin

# usage: python tools/jsonl_to_spacy.py input.jsonl output.spacy

nlp = spacy.blank("de")
docbin = DocBin(store_user_data=True)

with open(sys.argv[1], "r", encoding="utf8") as f:
    for line in f:
        if not line.strip():
            continue
        record = json.loads(line)
        text = record["text"]
        ents = record.get("entities", [])
        doc = nlp.make_doc(text)
        spans = []
        for start, end, label in ents:
            try:
                span = doc.char_span(start, end, label=label, alignment_mode="contract")
                if span is not None:
                    spans.append(span)
            except Exception:
                continue
        doc.ents = spans
        docbin.add(doc)

out_path = sys.argv[2]
docbin.to_disk(out_path)
print(f"✅ Saved {len(docbin)} docs to {out_path}")
