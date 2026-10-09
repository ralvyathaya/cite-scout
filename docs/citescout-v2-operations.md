# CiteScout v2: menjalankan pilot

Implementasi mengikuti `docs/citescout-v2-final-spec.md`. Dokumen ini adalah runbook operator; bukan bukti validasi pasar.

## Pemeriksaan lokal

Jalankan aplikasi dengan `npm run dev`. Script `predev` menerapkan migrasi D1 lokal yang belum dijalankan sebelum Vite mulai, termasuk ketika memakai database dari versi lama. Jika menjalankan Vite langsung, jalankan `npm run db:migrate:local` terlebih dahulu. Database lokal berada di checkout tempat perintah dijalankan; tiap worktree memiliki database sendiri.

```powershell
npm run typecheck
npm run lint
npm run build
npm run check:v2
```

`check:v2` memakai SQLite **in-memory** dan respons sintetis. Tidak membaca secret, mengubah D1 lokal/remote, atau memanggil provider. Ia memeriksa migrasi, idempotensi/concurrent claims, trial/retry/caps, source linkage, perbandingan, ownership, refund yang datang tidak berurutan, SQL laporan, dan penghapusan bukti pribadi.

## Sebelum membuka pilot

1. Simpan backup D1 dan terapkan `0002_citescout_v2.sql` pada salinan dogfood terlebih dahulu. Migrasi additive; tidak menghapus observasi existing. Snapshot/journal Drizzle disertakan supaya generator berikutnya mengenali schema v2.
2. Terapkan migrasi sebelum Worker v2. Untuk development: `npm run db:migrate:local`. Migrasi remote dan deployment adalah langkah operator terpisah; belum dijalankan oleh implementasi ini.
3. `wrangler.production.jsonc` masih memakai **Lemon Squeezy test mode**. Untuk pembayaran nyata, konfigurasi store/product/variant live $19/bulan dan secret yang sesuai. Jangan menghitung transaksi test sebagai conversion.
4. Aktifkan webhook pembayaran sukses, recovered, dan refunded selain lifecycle subscription existing. Refund invoice penuh/parsial membuat pembayaran dikecualikan dari laporan, termasuk saat event datang tidak berurutan. Rujukan: [event types](https://docs.lemonsqueezy.com/help/webhooks/event-types) dan [invoice object](https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object).
5. Jalankan satu capture dogfood melalui alur normal setelah provider/secret dikonfigurasi. Periksa actual shape, jawaban/sumber, batas klaim, dan satu replay webhook. Self-check sintetis tidak menggantikan langkah ini atau pengujian browser.

`V2_SCANS_ENABLED=false` menghentikan claim provider baru. `EXTERNAL_INTEGRATIONS_ENABLED=false` juga menonaktifkan capture. Bukti existing tetap terbaca. Cron existing berjalan setiap jam; semua pekerjaan disimpan di D1. Pengiriman baseline menyalakan satu attempt background; cron melanjutkan sisanya. Worker restart/timeout memulihkan lease tanpa menggandakan attempt hari yang sama.

## Enrollment (maksimum 10 akun qualified)

Peserta membuat akun terlebih dahulu. Founder memperoleh user ID, memastikan role B2B SaaS dan empat kriteria qualification dalam spec. Jangan enroll akun founder/dogfood ke cohort evaluasi. Tidak mengganti peserta tidak aktif untuk memperbaiki denominator.

Simpan input **di luar Git**, misalnya `C:\private\enrollment.json`:

```json
{
  "userId": "USER_ID",
  "role": "founder",
  "manualCheckAt": "2026-10-08T09:00:00Z",
  "authorityConfirmed": true,
  "exampleVerified": true,
  "hasThreeQuestionsAndCompetitors": true,
  "assisted": true
}
```

Role alternatif: `first_marketer`. Tanggal manual check harus dalam 30 hari terakhir. Generator menolak field tidak dikenal dan hanya menghasilkan SQL; akses D1 tetap melalui sesi Wrangler operator yang terautentikasi.

```powershell
npx tsx scripts/pilot.ts enroll C:\private\enrollment.json | Set-Content -Encoding utf8 C:\private\enrollment.sql
npx wrangler d1 execute DB --remote --config wrangler.production.jsonc --file C:\private\enrollment.sql
```

Gunakan `--local --config wrangler.jsonc` untuk database development. Hasil SELECT harus berisi enrollment; hasil kosong berarti user tidak ada atau cohort sudah penuh. Menjalankan ulang input tidak memberi trial kedua. Jika proses terputus setelah enrollment sebelum event, jalankan ulang SQL yang sama untuk melengkapi event idempotent.

## Ledger interpretasi privat

Simpan user ID pseudonim, qualification, assistance/reminder, question ID, observation awal/pembanding/later, interviewAt, interpretasi, decision, actionDate, nextReviewDate, followupOutcome, dan refusal/cancellation reason **di luar repository**. Dapatkan persetujuan sebelum menyimpan kutipan. Hapus row ledger ketika akun dihapus.

Setelah wawancara, buat input privat:

```json
{
  "userId": "USER_ID",
  "interviewId": "00000000-0000-4000-8000-000000000001",
  "observationId": "OBSERVATION_UUID",
  "compareToId": "EARLIER_OBSERVATION_UUID",
  "decision": "no_action",
  "confirmed": true,
  "assisted": true,
  "interviewedAt": "2026-10-12T09:00:00Z"
}
```

`compareToId` opsional. Enum decision: `investigate`, `change`, `defer`, `no_action`. `confirmed` berarti peserta menjelaskan keputusan dan menunjuk bukti; bukan inferensi dari klik. Gunakan `scripts/pilot.ts decision` dengan langkah generate/execute yang sama. Script memeriksa ownership bukti dan menulis satu event per interview ID; teks wawancara tidak dikirim ke telemetry.

## Laporan cohort dan biaya

```powershell
npx wrangler d1 execute DB --remote --config wrangler.production.jsonc --file scripts/pilot-report.sql --json
```

Output berisi satu row per enrollment: first value/3 baseline answers, activation 48 jam, later use pada bukti baru pertanyaan sama, conversion window, early payment, renewal, dua minggu penggunaan baru, dan confirmed decision. `paid_weeks_with_new_evidence >= 2` **bersama** `renewed=1` adalah paid retention. Semua data telemetry berumur 90 hari; ekspor ringkasan privat sebelum kedaluwarsa. Missing telemetry tetap unknown dan perlu wawancara.

Gunakan denominator 10 setelah cohort penuh; report cohort usable-follow-up hanya diagnosis sekunder. Gabungkan assistance/reminder/refusal dari ledger. Rekonsiliasi pembayaran/refund dengan dashboard billing sebelum mengambil keputusan, terutama bila webhook pernah gagal atau belum diaktifkan.

Aturan spec: ≥7 activated, ≥5 later use, ≥3 membayar, ≥2 confirmed decisions; kemudian minimal 2 paid retention. ≥3 gagal mendapat follow-up usable berarti demand inconclusive. Pengalaman berfungsi tetapi 0–1 membayar atau <3 later use: hentikan ekspansi dan wawancarai penolak.

Tinjau tagihan provider setiap hari. Warning $20 kumulatif dan hentikan claim baru pada review ketika mencapai $30 dalam eksperimen 30 hari pertama. Ini kontrol manual, bukan hard dollar cap. Guard fisik: global150/hari, user350/bulan UTC, project10/hari, question1/hari, cron20/invocation. Cost yang tidak dilaporkan adalah unknown. Target biaya ≤$5/account-month harus dibuktikan dari tagihan.

## Batas pemeriksaan implementasi

Belum menjalankan provider/billing live, migrasi terhadap salinan data produksi, deployment, pengujian browser, atau seluruh suite legacy. Review independen dapat gagal karena batas penggunaan subagent; lihat catatan handoff untuk hasil pemeriksaan aktual. D1 production dan SQLite lokal tidak identik; self-check memeriksa SQL dan invariant, bukan seluruh perilaku platform.
