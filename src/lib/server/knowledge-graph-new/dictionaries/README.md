# Knowledge Graph Dictionaries

These JSON files are external guidance for the knowledge graph extractor. They
are intentionally data files rather than hardcoded extraction branches.

The extractor uses them to:

- normalize aliases, for example `TCCC` to `Tactical Combat Casualty Care`;
- give GLiNER/LLM extraction stable entity types;
- constrain relationship names to reusable predicates;
- reject evidence-free co-occurrence or page-layout relations;
- remember accepted labels in SQLite memory tables after graph builds.

Authoritative sources used for the starter dictionaries include:

- Air Force Glossary, Curtis E. LeMay Center for Doctrine Development and Education.
- DoD Dictionary / DoD Terminology Program, Joint Chiefs of Staff.
- Tactical Combat Casualty Care and Joint Trauma System public guidance.
- National Library of Medicine MeSH controlled vocabulary concepts for medical terms.

Add new domain files as `entities.<domain>.json` or `relations.<domain>.json`.
The extractor reads all JSON files in this folder automatically.
