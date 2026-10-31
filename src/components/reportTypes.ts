/**
 * Tipe & teks laporan penyalahgunaan (T-32; D-20, TASK bagian 6 `report_room`).
 * Kode alasan sinkron dengan enum RPC: SPAM | ABUSE | ILLEGAL | OTHER.
 * Identitas pelapor tidak pernah tampil di UI; server menyimpan penanda unik
 * untuk deduplikasi dan menghitung pelapor unik (report_hide_threshold = 3).
 */

export type ReportReason = 'SPAM' | 'ABUSE' | 'ILLEGAL' | 'OTHER';

export interface ReportReasonInfo {
  code: ReportReason;
  label: string;
  detail: string;
}

export const reportReasons: readonly ReportReasonInfo[] = [
  {
    code: 'SPAM',
    label: 'Spam',
    detail: 'Iklan, promosi, atau ajakan berulang yang tidak diminta.',
  },
  {
    code: 'ABUSE',
    label: 'Perundungan',
    detail: 'Serangan pribadi, ancaman, atau menekan orang lain.',
  },
  {
    code: 'ILLEGAL',
    label: 'Melanggar hukum',
    detail: 'Konten ilegal seperti penipuan, SARA, atau konten anak.',
  },
  {
    code: 'OTHER',
    label: 'Lainnya',
    detail: 'Tidak masuk kategori lain tapi menurutmu tidak layak.',
  },
] as const;

/** Ambang laporan unik sebelum room otomatis HIDDEN (app_config.report_hide_threshold). */
export const reportHideThreshold = 3;

/** Teks ringkas aturan laporan — dipakai modal dan halaman aturan konten. */
export const reportRule =
  `Identitas pelapor tidak ditampilkan ke Host atau Admin; server memakai penanda unik agar satu pelapor dihitung sekali per room. ${reportHideThreshold} laporan unik menandai room sebagai tersembunyi dari FYP sampai Admin meninjau.` as const;
