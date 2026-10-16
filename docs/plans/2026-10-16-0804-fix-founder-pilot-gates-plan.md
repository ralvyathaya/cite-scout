---
title: "CiteScout Founder Pilot Gates - Plan"
type: fix
date: 2026-10-16
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# CiteScout Founder Pilot Gates - Plan

## Goal Capsule

- **Objective:** Pemilik dapat menilai kesiapan founder pilot dari jawaban asli, diagnosis yang ditinjau, dan perbandingan yang benar-benar dilakukan setelah pekerjaan nyata.
- **Means:** Perbaikan adapter berdasarkan bukti, evaluasi manusia, follow-up action dengan scope eksplisit, lalu pengujian staging terbatas (KTD1–KTD6).
- **Authority:** R1–R10 mengatur perilaku; KTD mengatur mekanisme; unit tidak boleh melemahkan keduanya.
- **Execution profile:** Kerjakan kode/fixture/evaluasi offline dahulu. Tahap live pada U6 memerlukan persetujuan baru atas scope dan budget; permintaan membuat plan ini belum memberikannya.
- **Stop:** Batas biaya/percobaan tercapai, hasil berbayar ambigu, biaya tidak diketahui, provenance bermasalah, atau gate gagal tanpa perbaikan yang terbukti.
- **Finish:** Implementer menyelesaikan kode, CI dan receipt staging; pemilik meninjau gate dan memutuskan pembukaan pilot. Production rollout dan undangan pilot bukan bagian eksekusi ini.

---

## Product Contract

### Summary

Tutup empat gap sebelum founder pilot: kelengkapan OpenAI, jawaban Bing Copilot nyata, evaluasi diagnosis terhadap bukti asli, dan pengukuran setelah aksi. Mulai dari data tersimpan; lakukan capture baru hanya dalam allowance owner staging yang disetujui.

### Problem Frame

UI U1–U3 telah disetujui dan PR #7 merged ke master pada commit 3f4122704873e082340a99f65dc5c8275a2cea89. CI sesudah merge hijau. Kematangan UI belum membuktikan kualitas observasi atau diagnosis.

Dua putaran lama menghasilkan 24 percobaan dan 20 observasi: sembilan complete, enam partial OpenAI, lima no-feature Bing. Semua 20 klasifikasi sudah tersimpan. Run kedua dimulai sebelum waktu implementasi yang dilaporkan pemilik, sehingga tidak membuktikan pengukuran setelah aksi. Pin lama dan koreksinya harus tetap terbaca.

### Requirements

**Access, biaya dan riwayat**

- R1. Uji hanya akun pemilik di staging ber-Access, dengan grant paling lama 14 hari dan jadwal harian mati.
- R2. Tambahan allowance harus eksplisit dan terbatas; semua ledger, raw evidence, reservasi lama dan pin dipertahankan.
- R3. Timeout, respons ambigu, kegagalan persistence atau biaya unknown menghentikan admission berikutnya; tidak ada pengiriman ulang berbayar atau fallback otomatis.

**Empat gate**

- R4. OpenAI complete hanya berarti respons, search item, pesan, teks dan citation memenuhi kontrak provider; incomplete yang sah tetap partial.
- R5. Gate Copilot memerlukan jawaban AI nyata di Bing pada pertanyaan buyer yang relevan; organic snippets dan no-feature tidak memenuhi gate.
- R6. Diagnosis dan tugas dievaluasi manusia terhadap jawaban serta konteks yang benar-benar tersedia; unknown/unclear dan suspected tidak dinaikkan menjadi kepastian tanpa bukti.
- R7. Perbandingan setelah aksi memakai pekerjaan nyata, URL dan waktu implementasi yang dapat diperiksa, serta seluruh cohort yang dipilih secara eksplisit sebelum aksi.
- R8. Pergantian collector/parser, model, prompt, output budget, rubric atau policy membentuk konteks baru; histori tidak ditulis ulang agar terlihat berhasil.

**Delivery**

- R9. Pertahankan Workers/D1, fixture synthetic terpisah, secrets environment, dan pola dashboard yang disetujui; CI tidak memakai key provider nyata.
- R10. Receipt akhir menilai setiap gate sendiri, memperlihatkan denominator/coverage dan kegagalan, serta tidak mengklaim kenaikan visibility, akurasi umum, consumer parity atau ROI kausal.

### Key Decisions

- **Staging owner dahulu** (session-settled: user-approved — chosen over langsung founder pilot: kualitas engine dan diagnosis belum terbukti). Governs R1, R10.
- **Perbaikan dilakukan manusia melalui checklist/brief** (session-settled: user-directed — chosen over drafting/publishing otomatis: pemilik mengerjakan di website/tools sendiri). Governs R6, R7.
- **Bing Copilot Answers sebagai surface awal** (session-settled: user-directed — chosen over aplikasi chat Copilot: scope collector awal lebih terbatas). Governs R5, R8.
- **Clef Flash dan SerpApi tetap digunakan** (session-settled: user-directed — chosen over dependency wajib Jev/DataForSEO: hindari top-up wajib untuk development/MVP). Governs R2, R9.

### Success Criteria

Angka smoke gate berikut adalah usulan untuk pilot yang seluruh diagnosisnya ditinjau manusia, bukan estimasi akurasi populasi.

| Gate | Bukti minimum untuk lulus |
| --- | --- |
| G1 — OpenAI | Tiga pertanyaan buyer pada baseline konfigurasi final semuanya complete, search nyata terkonfirmasi, citation/usage/model dipertahankan; kasus incomplete dan malformed tetap ditolak oleh regression tests. |
| G2 — Copilot | Sedikitnya satu complete AI answer pada pertanyaan buyer relevan, dengan referensi jawaban yang dapat ditelusuri dan provenance Bing/SerpApi. Control umum hanya membuktikan transport/parser. |
| G3 — Diagnosis | Semua 20 record lama dipertanggungjawabkan; split evaluasi dibekukan; sedikitnya tiga jawaban real complete/usable held-out mempunyai critical labels benar atau abstention yang tepat. Tidak ada false-complete, quote/citation palsu, atau supported root cause tanpa bukti. Coverage kelas/engine yang belum diuji dinyatakan belum diketahui. |
| G4 — Setelah aksi | Ada baseline dan dua hari UTC follow-up setelah pekerjaan nyata, dalam jendela tujuh hari. Setiap cohort terpilih untuk metric utama mempunyai baseline dan sedikitnya satu eligible post sample; follow-up yang gagal tetap dilaporkan. Waktu mulai request memenuhi batas implementasi dan semua scope cocok. |
| Release decision | G1–G4 ditinjau pemilik, CI hijau, staging kembali paused, dan keterbatasan/cost receipt tersimpan. Hasil unchanged/turun boleh lulus; scope hilang tetap inconclusive. |

### Scope Boundaries

Tidak ada rebrand/redesign besar, publikasi otomatis, billing live, undangan founder, produksi, collector chat Copilot baru, atau dependency provider baru.

Dipertimbangkan tetapi tidak dibangun: campaign management subsystem dan tabel baru, karena cumulative operator ceilings dan tabel action/evidence/event yang ada cukup untuk scope ini. Tidak membangun hosted Evals/LLM judge; evaluasi kecil dapat dijalankan lokal dan platform OpenAI Evals dijadwalkan sunset.

#### Deferred to Follow-Up Work

Agency/multi-project, pricing/kuota founder, jadwal harian pilot, statistical quality study, buyer-fit dengan verified product criteria, dan alternatif classifier/collector memerlukan scope terpisah. Kegagalan Copilot bukan izin mengganti surface secara diam-diam.

---

## Planning Contract

### Current Evidence and Constraints

- src/server/v2/geo-store.ts membatasi admission staging secara kumulatif pada 24 observation attempts, termasuk admission SQL atomik.
- src/server/v2/geo-provider-budget.ts membatasi request lifetime OpenAI 6, Perplexity 6, SerpApi 18 dan classifier 24. Admission menghitung nilai terbesar reserved/reported/estimated per entri; reservasi lama tidak dilepas.
- src/server/config.ts dan scripts/check-staging.mjs menolak spend ceiling di atas US$5. Mengubah daily quota saja tidak membuka pengujian baru.
- src/integrations/openai/geo.ts memaksa web search, satu tool call, reasoning none, store:false. Frozen output budget sekarang 700. Enam partial lama mempunyai lebih dari satu penyebab; parser bug belum terbukti.
- src/integrations/serpapi/geo.ts sudah menggunakan no_cache:true dan memisahkan organic results dari AI answer. Google dapat membutuhkan dua request untuk satu observasi.
- src/server/v2/analysis.ts dapat melakukan backfill semua observasi yang belum dianalisis. Tidak mengirim verifiedCriteria; buyer-fit unclear dan evidence unavailable dapat benar.
- src/domain/geo-playbooks.ts dan src/server/v2/actions.ts menggabungkan bukti berdasarkan reason/asset/template, termasuk ke task completed. Prompt baru tidak menjamin task atau scope baru.
- src/server/v2/measurement.ts membekukan scope saat completion. Request yang mulai sebelum implementasi tidak menjadi after sample meskipun selesai sesudahnya. Pin 14 Oktober berakhir 21 Oktober 00:27 UTC; tetap historis bila tidak memenuhi scope/waktu.

### Key Technical Decisions

- KTD1. **Perluas cumulative ceilings tanpa reset.** Satu konfigurasi staging tervalidasi dipakai oleh readiness, admission dan SQL atomik. Default tetap paused/zero; explicit overrides ditolak di production. Batas awal ada pada Budget Proposal; snapshot execution harus cocok sebelum allowance diaktifkan. Ini memenuhi R1–R3 tanpa campaign database baru.
- KTD2. **Replay envelope dahulu, lalu satu konfigurasi OpenAI final.** Simpan incomplete_details dan status per item sebagai bukti. Default model tetap gpt-6-luna, search required, max_tool_calls satu, reasoning none, store:false. Uji calon output budget 1.600 khusus OpenAI; bila berubah, versioning prospective collector/context dan reservation mengikuti. Jangan melonggarkan status guard hanya untuk membuat G1 hijau. Memenuhi R4, R8.
- KTD3. **Audit seluruh bentuk Copilot block yang relevan.** Bandingkan overview, question_and_answer dan tabbed_content pada dokumentasi dengan fixture/raw tersimpan. Bing tetap engine=bing; bing_copilot adalah surface lain dan di luar scope. Missing block tetap no-feature; malformed block tetap partial. Memenuhi R5.
- KTD4. **Eval lokal dengan label manusia.** Manifest/hash mencatat bukti dan partisi sebelum hasil model dibuka. Pisahkan sekitar dua prompt-family untuk calibration dan satu untuk held-out; near-duplicate antarhari tidak menyeberang partisi. Counts mengikuti grouping, bukan target split. Fresh held-out buyer records boleh menambah coverage setelah rubric dibekukan. Synthetic guardrails dilaporkan terpisah. Memenuhi R6, R10.
- KTD5. **Prospective follow-up action mempunyai identitas sendiri.** Tambahkan operasi create follow-up dari task Owned yang relevan, dengan selected baseline observation/analysis proofs, revision, request ID dan rencana perubahan URL. UI memperlihatkan included/excluded cohorts dan tautan riwayat sumber sebelum pengguna mengonfirmasi. Simpan hubungan/selection/reason pada event yang ada; sync tidak boleh memasukkan scope lama lagi. Source task dan event completion lama tidak berubah. Memenuhi R2, R7, R8; mengubah completion scope lama akan menyulitkan audit.
- KTD6. **Eksperimen memakai manifest subset eksplisit.** Empat engine tetap terpilih di settings; setiap run membawa daftar prompt ID, engine dan request ID yang sudah dicatat. Control/canary IDs dipisahkan dari measurement set dan dikecualikan dari laporan bisnis, held-out labels dan scope follow-up. UI umum tetap dapat menampilkan record canary sebagai bukti real; manifest bukan flag diagnostic global yang belum ada. Memenuhi R3, R7, R10.

### High-Level Technical Design

Alur admission dan validasi:

~~~mermaid
flowchart TD
  A[Offline replay and human labels] --> B[Freeze candidate and scope]
  B --> C{New live scope approved?}
  C -->|No| P[Paused; no provider calls]
  C -->|Yes| D[Access, ledger and balance preflight]
  D --> E[Reserve observation and provider request]
  E --> F[Capture original target answer]
  F --> G{Known cost and valid provenance?}
  G -->|No| P
  G -->|Yes| H[Review canary and gate receipt]
  H --> I{G1 and G2 demonstrated?}
  I -->|No| P
  I -->|Yes| J[Baseline then prospective action]
  J --> K[Owner performs and records real change]
  K --> L[Two bounded follow-ups]
  L --> M[Review G3 and G4; pause all flags]
~~~

Identitas action dan riwayat:

~~~mermaid
flowchart LR
  A[Source action and old events] -->|Read only| B[Included and excluded proof review]
  C[Final baseline proofs] --> B
  B --> D[New follow-up action and audit event]
  D --> E[Actual implementation and completion pin]
  E --> F[Existing frozen-scope comparison]
  G[Fresh post-action observations] --> F
~~~

### Assumptions and Execution-Time Decisions

Usulan budget/sampling di bawah belum disetujui untuk dibelanjakan. Verifikasi saldo provider, current counters, tarif dan expiry dilakukan saat eksekusi; saldo/kuota akun tidak diperiksa pada sesi plan ini.

OpenAI budget 1.600 dan kebutuhan perubahan parser harus dibuktikan dari replay/kontrak. Jika satu-tool search tetap incomplete, hentikan gate dan laporkan; tidak ada model/tool-budget escalation otomatis.

Manusia harus benar-benar mengerjakan perubahan Owned baru dan memberikan URL/waktu/bukti. Plan tidak menganggap catatan publikasi lama sebagai verifikasi. Pengujian dapat terhenti karena provider tidak menampilkan feature atau karena data held-out belum cukup.

### Budget Proposal

**Usulan: maksimal US$5 biaya tambahan**, tanpa subscription provider baru. Batas ini adalah allowance maksimum, bukan biaya yang ditargetkan atau izin spend pada sesi ini.

| Tahap | Observation attempts maksimum | Request collector maksimum | Syarat lanjut |
| --- | ---: | --- | --- |
| Offline replay, labels, fixture | 0 | 0 | Kontrak dan candidate dibekukan |
| Canary OpenAI | 3 | OpenAI 3 | Periksa tiap envelope; failure yang belum dipahami menghentikan tahap |
| Canary Bing | 6 | SerpApi 6 | Bank query relevan dibekukan; paling banyak dua putaran terencana, bukan retry otomatis |
| Baseline | 12 | OpenAI 3, Perplexity 3, SerpApi 9 | Tiga buyer prompt × empat engine; Google maksimum dua request |
| Follow-up sekitar +72 jam | 12 | OpenAI 3, Perplexity 3, SerpApi 9 | Setelah implementasi, tanggal UTC berbeda |
| Follow-up sekitar hari ke-6 | 12 | OpenAI 3, Perplexity 3, SerpApi 9 | Sebelum jendela tujuh hari berakhir |

Total maksimum: **45 observation attempts; OpenAI 12, Perplexity 9, SerpApi 33 HTTP requests**. Maksimum classifier baru **65**: allowance 20 replay versi candidate bila diperlukan + semua 45 capture. Cache existing classification digunakan dahulu; UUID baru tidak memaksa inference. Tidak ada live Clef-vs-Clef-Flash bake-off atau page-check tambahan dalam hitungan ini.

Tarif publik dicek 16 Oktober 2026. Semua angka berikut estimasi, bukan invoice:

| Komponen | Dasar tarif | Estimasi tambahan | Reservation proposal |
| --- | --- | ---: | ---: |
| OpenAI, maksimum 12 | gpt-6-luna US$0,10/M input + US$0,50/M output; web search US$0,01/call | US$0,15–0,40 | 12 × US$0,10 = US$1,20 |
| Perplexity, maksimum 9 | fast saat ini memakai priority Luna US$0,20/M input + US$1/M output; Fast Search US$0,001/invocation | US$0,04–0,20 | 9 × US$0,10 = US$0,90 |
| SerpApi, maksimum 33 | Free 250/bulan, 50/jam, hanya jika saldo free yang tersedia cukup | US$0; 33 kredit | 33 request; tidak auto-upgrade |
| Clef Flash, maksimum 65 | US$0,038/M input; gross cost sebelum free neurons | US$0,01–0,05 | 65 × US$0,002 = US$0,13 |
| Total model/search yang ditagih | Termasuk token search; input aktual belum diketahui | **Bulatkan US$0,25–1** | **US$2,23** sebelum headroom US$5 |

Dasar token estimasi: OpenAI sekitar 20k–128k billed input/request dan paling banyak 1.600 output; Perplexity sekitar 10k–40k input/request, paling banyak 700 output dan satu Fast Search; Clef sekitar 4k–20k input/inference. Full input termasuk questions harus cocok dengan limit hosted Flash 24.576 token. Tarif aktual/model/preset dan batas biaya per request harus divalidasi sebelum admission; jika tidak dapat dibatasi, jangan enable.

Perplexity fast adalah preset dinamis; returned model dan metadata disimpan dan perubahan material memisahkan cohort. OpenAI estimates memakai Standard nonregional, tanpa asumsi cache discount. Free Workers AI 10.000 neurons/hari adalah allowance akun bersama; budget gross di atas tidak bergantung pada sisa gratisnya.

SerpApi preflight memerlukan sedikitnya 33 kredit tersisa plus margin 10 kredit dan hourly headroom. Verifikasi lewat Account API gratis dengan allowlist output aman; jangan mencetak response yang memuat key/identitas. Jika tidak cukup, stop atau tunggu reset yang terverifikasi. Paket berbayar bukan biaya marginal per query dan tidak dibeli otomatis.

Snapshot lama: 24 observation attempts; ledger OpenAI 6, Perplexity 6, SerpApi 17, classifier 20; conservative reserved US$4,54. Tambahan scope menghasilkan cumulative ceilings berikut **hanya jika snapshot belum berubah**:

| Admission | Cumulative ceiling proposal |
| --- | ---: |
| Observation attempts | 69 |
| OpenAI requests | 18 |
| Perplexity requests | 15 |
| SerpApi requests | 50 |
| Classifier requests | 85 |
| Conservative spend | US$9,54 = US$4,54 lama + US$5 tambahan |

Daily collector cap cukup 12 dengan canaries/baseline pada hari UTC terpisah; monthly cap harus mengakui penggunaan lama. SerpApi monthly cap tetap <=250 dan disesuaikan saldo aktual. Allowance stage tidak boleh dipinjam tahap lain untuk memperpanjang canary.

Saldo tambahan/top-up minimum OpenAI/Perplexity, pajak, biaya Workers/D1 existing dan waktu manusia tidak termasuk estimasi inference. Tidak ada pembelian/top-up yang diotorisasi di sini. Reservasi aplikasi tidak menggantikan invoice provider; reconcile biaya aktual per batch dan stop bila melampaui ceiling per request.

### Risks and Dependencies

- Copilot dapat tetap no-feature meskipun collector benar; G2 tetap terbuka setelah enam canary, tanpa penggantian surface/fallback.
- Data kecil dan dominan absent dapat menghasilkan angka bagus tanpa coverage positif; laporkan confusion counts, unknown denominator dan kelas yang belum terukur.
- Delayed publication atau follow-up lewat tujuh hari membuat comparison inconclusive; tidak mengubah timestamp atau mengulang completion sekadar memindahkan jendela.
- API follow-up adalah perubahan additive baru di fase ini, berbeda dari fase UI sebelumnya. Gunakan auth/tenant checks dan idempotency yang ada.
- Rubric/model/preset drift dapat memutus comparability. Freeze sebelum baseline dan laporkan model upstream Google/Bing yang tidak tersedia.
- Flag rollback harus menuju versi dengan paid flags mati. Worker rollback tidak mengembalikan D1; bukti dan task tetap dipertahankan.

---

## Implementation Units

### U1. Bounded owner-test allowance without ledger reset

**Goal / Requirements:** Tambahan scope dapat diaktifkan dan dihentikan secara atomik tanpa melonggarkan batas production; R1–R3, R9, KTD1.

**Files:** src/server/config.ts; src/server/bindings.d.ts; worker-configuration.d.ts; src/server/v2/geo-store.ts; src/server/v2/geo-provider-budget.ts; src/server/v2/geo-readiness.ts; scripts/check-staging.mjs; wrangler.staging.jsonc; .dev.vars.example; tests/unit/config.test.ts; tests/unit/staging-config.test.ts; tests/integration/geo-four-engine.test.ts; docs/four-engine-staging.md.

**Approach:** Ganti fixed lifetime numbers dengan validated cumulative operator ceilings, memakai satu sumber nilai di checks/admission/SQL. Pertahankan default scope lama atau paused; konfigurasi tambahan tetap zero sebelum approval U6. Perbarui build preflight dan generated types, bukan hanya Wrangler vars. Simpan snapshot dan sublimit pada runbook.

**Test scenarios:**

1. Dua concurrent admissions mendekati limit menerima hanya batch yang muat; replay tidak menambah reservasi.
2. Data lama, perpindahan bulan, penghapusan proyek dan reserve > actual tetap dihitung.
3. Override tidak lengkap/negatif/berlebih atau dipasang di production ditolak; expiry/akun lain tetap terkunci.
4. Unknown/uncertain cost dan kehilangan hasil persistence memblokir request berikutnya.
5. Google follow-up membutuhkan request kedua yang sudah dianggarkan; classifier cap dibagi seluruh backend yang relevan.

**Verification:** Fixture integration dan staging static guard membuktikan semua cumulative caps, tanpa key/API nyata. Tidak ada migrasi/reset.

### U2. Establish the OpenAI completion contract

**Dependencies:** Offline dapat berjalan bersama U1; live tergantung U6.

**Goal / Requirements:** Bedakan incomplete sah dari parser defect berdasarkan envelope asli; R4, R8, KTD2.

**Files:** src/integrations/openai/geo.ts; src/server/v2/geo-store.ts; src/shared/geo.ts; tests/unit/geo-openai.test.ts; tests/unit/geo-context.test.ts; tests/integration/geo-four-engine.test.ts; docs/validation/2026-10-13-four-engine-staging.md as historical input.

**Approach:** Replay keenam raw captures melalui normalizer dan catat penyebab per ID. Tambahkan fixture untuk setiap bentuk yang benar-benar diamati. Terapkan perbaikan hanya bila kontrak membuktikannya; kenaikan output budget hanya prospective OpenAI. Versioning hanya engine yang berubah, agar Google/Perplexity tidak berganti cohort tanpa alasan.

**Test scenarios:**

1. Completed envelope dengan unfinished search item tetap partial.
2. Output limit, pesan incomplete, search hilang, source invalid dan Unicode citation boundary tidak menjadi complete.
3. Respons valid mempertahankan multipart text, reported model, usage dan original citation offsets.
4. Output/parser version baru berbeda cohort; replay lama tidak mengubah historical capture.
5. Timeout/oversized response dan duplicate worker execution tidak memanggil ulang provider.

**Verification:** Kontrak fixture lulus dan setiap partial lama mempunyai penjelasan atau unresolved provider question yang eksplisit. G1 sendiri menunggu baseline live.

### U3. Validate Bing answer extraction

**Goal / Requirements:** Koleksi hanya AI answer milik surface yang dipilih; R5, R8, KTD3.

**Files:** src/integrations/serpapi/geo.ts; src/shared/geo.ts; tests/unit/geo-serpapi.test.ts; tests/integration/geo-four-engine.test.ts; docs/geo-provider-audit.md.

**Approach:** Audit format documented Copilot terhadap parser sekarang, termasuk tabbed_content bila relevan. Pertahankan answer-level vs returned-result references; perbaikan prospective tidak mereklasifikasi no-feature historis.

**Test scenarios:**

1. Genuine overview/question-and-answer/tabbed form menyimpan teks dan sumber AI yang tepat.
2. Organic-only menghasilkan no-feature; blok kosong/rusak menghasilkan partial.
3. Respons HTTP error, stale token Google dan budget request kedua habis mempertahankan hasil sibling tanpa retry.
4. Request memakai no_cache, engine=bing dan locale/device yang dibekukan; engine bing_copilot tidak diterima sebagai pengganti diam-diam.

**Verification:** Fixture cocok kontrak resmi dan bank canary dibekukan; actual positive G2 tetap memerlukan U6.

### U4. Human-reviewed diagnosis evaluation

**Goal / Requirements:** Tersedia evaluasi kecil yang dapat diaudit tanpa mencampur model confidence, synthetic tests dan kualitas nyata; R6, R10, KTD4.

**Files:** scripts/evaluate-geo.ts (new, local input only); tests/unit/geo-evaluation.test.ts (new); research/geo-evaluation-report.md; research/geo-rubric-manifest.json; .gitignore; tests/unit/geo-classification.test.ts; tests/unit/geo-playbooks.test.ts; tests/integration/geo-analysis.test.ts. Private manifests/raw/labels remain under ignored research/private/.

**Approach:** Export terbatas dan sanitized ke direktori lokal yang diabaikan Git. Bekukan grouped split dan human labels sebelum model decisions ditampilkan. Gunakan buildGeoEvaluation/projection/diagnosis yang ada; tidak membuat classifier kedua. Bila calibration membuktikan defect, versioning rubric/policy dan gunakan jatah replay yang dialokasikan sebelum final hold-out dibuka.

**Test scenarios:**

1. Semua 20 IDs terhitung satu kali, duplicate group tidak menyeberang split, unknown denominator ditampilkan sebagai not measurable.
2. Abstention pada no-feature/partial/missing verified criteria dihitung benar; absence saja tidak membuktikan retrieval root cause.
3. Gold-determinate yang diabstain dihitung miss/coverage loss, bukan dihapus untuk memperbagus angka.
4. Quote offsets, source linkage, homonym, competitor-only, embedded instructions dan evidence support diuji dengan fixtures synthetic terpisah.
5. Eval script tidak mempunyai transport provider; laporan tidak memuat secrets atau raw pribadi pada repo public.

**Verification:** Counts/per-field disagreements, critical failures dan coverage dilaporkan. G3 memakai Success Criteria; probabilitas native bukan akurasi.

### U5. Prospective action with explicit measurement scope

**Dependencies:** Baseline candidate semantics dari U2–U4; implementasi dan fixture dilakukan sebelum live.

**Goal / Requirements:** Pengguna dapat mencatat pekerjaan baru dan scope baru tanpa mengubah pin lama; R2, R7–R9, KTD5.

**Files:** src/shared/geo-actions.ts; src/server/v2/actions.ts; src/server/v2/geo-routes.ts; src/client/pages/v2/GeoWorkspace.tsx; src/client/pages/v2/geo-fixture.ts; tests/integration/geo-actions.test.ts; tests/integration/geo-measurement.test.ts; tests/unit/geo-fixture.test.ts; tests/e2e/geo-evidence-review.spec.ts.

**Approach:** Tambahkan authenticated create-follow-up operation di action resource yang ada. Validasi source revision/ownership, selected proof membership, complete usable analysis, current applicable cohort, satu pilihan per prompt/engine, serta target URL Owned. Tampilkan scope yang disertakan/dikecualikan dan alasan sebelum konfirmasi. Buat action ID/dedupe key berbeda secara idempotent, link source dan selection pada accepted event. Source tidak dimutasi dan ordinary sync tidak menambah bukti di luar selection; completion/reopen/comparison yang ada tetap digunakan.

**Test scenarios:**

1. Source completed dengan dua cohort lama dan satu baseline baru menghasilkan follow-up tepat dari selected baseline, sementara source/pin lama identik.
2. Repeat request/double click membuat satu action/event; source revision berubah menghasilkan conflict tanpa partial write.
3. Cross-tenant proofs, mismatched analysis, duplicate/conflicting cohort dan foreign Owned URL ditolak.
4. Sync setelah creation tidak memperluas scope; evidence dan event tetap tersedia setelah reopen.
5. Dialog keyboard/focus, included/excluded review, save failure draft, deep link dan synthetic fixture flow tetap berfungsi.
6. Fresh post sample memenuhi scope baru; earlier-started, changed config dan missing cohort tetap inconclusive.

**Verification:** Pengguna dapat menelusuri source → scope review → new work → genuine completion → comparison tanpa kehilangan konteks. Tidak ada D1 migration atau perubahan pin historis.

### U6. Execute the approved live experiment and readiness review

**Dependencies:** U1–U5 merged/CI hijau, staged dengan flags mati, dan persetujuan eksplisit pemilik terhadap Budget Proposal.

**Goal / Requirements:** G1–G4 dinilai dari receipt nyata dalam scope yang disetujui; R1–R10, KTD6.

**Files:** docs/four-engine-staging.md; docs/validation/YYYY-MM-DD-founder-pilot-gates.md (new receipt); research/geo-evaluation-report.md. Existing wrangler.staging.jsonc/secrets hanya diubah untuk window yang disetujui; tetap tidak menyentuh production.

**Approach:**

1. Cocokkan snapshot/counters, owner grant, Access, disabled alternate URLs, no pending work, harga/model, free credits dan reservation bounds. Bila berubah, hitung ulang sebelum enable.
2. Bekukan manifest canary/measurement, subset IDs dan request IDs. Canary pada UTC dates terpisah dari baseline menghindari first-daily-sample collision; jangan klik unfiltered Monitor Prompts untuk batch ini.
3. Jalankan canary satu per satu dan review ledger/envelope sebelum berikutnya; stop pada kegagalan yang belum dipahami. G2 no-feature dapat lanjut hanya ke request berikut yang sudah ada dalam bank terbatas.
4. Setelah candidate final, jalankan baseline tiga buyer prompt × empat engine. Pilih full expected scope/metric yang valid melalui U5 sebelum owner mengerjakan perubahan.
5. Owner melakukan perubahan nyata di tools sendiri, mencatat URL, substansi dan publication/implementation time yang dapat diperiksa; kemudian completion menciptakan pin baru.
6. Jalankan follow-up sekitar +72 jam dan hari ke-6 pada UTC dates berbeda. Buktikan request started at/after implementation, eligible daily samples dan exact frozen scope; tangani drift/missing evidence secara jujur.
7. Review diagnosis/action terhadap jawaban, biaya aktual/estimasi/reservasi dan empat gate. Matikan flags/caps kembali, periksa tidak ada pending jobs atau schedule, simpan worker versions dan rollback target dengan paid flags mati.

**Test expectation:** Tidak menambah tes yang hanya menyalin runbook. Kode/branches sudah dibuktikan di U1–U5; U6 menghasilkan live receipts, bukan pengganti unit/integration tests.

**Verification:** Receipt mempunyai pass/unmet per gate, attempts/request/cost totals, scope exclusions dan keterbatasan. Jika satu gate belum lulus, founder pilot tidak dinyatakan siap; tambahan budget/collector/surface memerlukan keputusan baru.

---

## Verification Contract

| Check | Applicability |
| --- | --- |
| npm run typecheck; npm run lint | Seluruh perubahan kode/config |
| npm run test:unit | Parser, config, rubric, eval counters dan fixture isolation |
| npm run test:integration; npm run check:v2 | Atomic admission, idempotency, tenant boundaries, action/event persistence dan migration/retention regression |
| Migration metadata checks in existing CI | Membuktikan perubahan tidak membawa migrasi |
| npm run build; npm run test:e2e | Browser action review, completion/comparison, filter/back/deep links, desktop/mobile dan keyboard |
| npm audit --audit-level=high | Dependency audit; tidak menambah framework/dependency baru |
| npm run check:staging | Live owner-only Access dan staging-isolation sebelum deployment/activation |
| Budget Proposal + G1–G4 receipts | Hanya setelah persetujuan live terpisah; tidak memakai fixture sebagai real result |

Run migration checks dan seluruh Checks CI yang sudah ada, bukan sekadar memilih command yang mudah lulus. Provider credentials tidak masuk CI. Source-changing rework mengulang tes yang relevan dan memperbarui cohort bila material.

---

## Definition of Done

- U1–U5 diimplementasikan dengan CI hijau, reviewed dan konfigurasi staging default tetap paused.
- U6 hanya berjalan bila scope/budget disetujui; ledger lama tidak dihapus atau di-reset.
- Empat gate mempunyai receipt yang memenuhi Success Criteria sebelum founder pilot dapat disebut siap.
- Diagnosis/metric tidak menyembunyikan unknown, partial, no-feature, class imbalance atau limited data.
- Tugas follow-up, source history, catatan, URL/waktu implementasi dan bukti after-action dapat ditelusuri.
- Runtime/fixture tidak memuat raw pribadi di repo public, credentials, experimental dead code atau automatic paid fallback.
- Scope yang belum lulus tetap dilaporkan sebagai unmet; tidak ada klaim uplift/ROI atau pembukaan pilot otomatis.

---

## Sources and Research

- [Merged PR #7](https://github.com/ralvyathaya/cite-scout/pull/7) dan [post-merge Checks](https://github.com/ralvyathaya/cite-scout/actions/runs/38832012968).
- Historical receipts: docs/validation/2026-10-13-four-engine-staging.md dan docs/validation/2026-10-14-four-engine-staging.md. Riwayat ini tidak ditulis ulang.
- [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing), [web search contract](https://developers.openai.com/api/docs/guides/tools-web-search): mendasari KTD2 dan Budget Proposal.
- [SerpApi Bing Copilot Answer](https://serpapi.com/bing-copilot-answer), [Google AI Overview](https://serpapi.com/ai-overview), [overview follow-up](https://serpapi.com/google-ai-overview-api), [pricing](https://serpapi.com/pricing), [Account API](https://serpapi.com/account-api): optional feature, request counting, freshness dan free-plan preflight.
- [Perplexity presets](https://docs.perplexity.ai/docs/agent-api/presets), [models/service tiers](https://docs.perplexity.ai/docs/agent-api/models), [pricing](https://docs.perplexity.ai/docs/getting-started/pricing): dynamic fast preset dan token/tool costs.
- [Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [October context/price update](https://developers.cloudflare.com/changelog/post/2026-10-09-clef-omni-workers-ai/): input-only price dan hosted input boundary.
- [Evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations): local human evaluation dipilih daripada membangun pada hosted Evals yang akan sunset.
