/**
 * Tiruan untuk kerangka `/admin/*` (T-32). Memberi wajah tabel Admin sampai T-57
 * menyambungkan RPC `admin_list_users` / `admin_list_reports` / `admin_audit_log`.
 * Identitas fiktif tanpa user_id; pelapor tidak pernah tampil (D-20, hanya laporan unik).
 */

export type ListingStatus = 'LISTED' | 'HIDDEN' | 'BANNED';

export interface AdminUserRow {
  handle: string;
  handleVerified: boolean;
  role: 'admin' | 'host' | 'guest';
  tier: 'free' | 'premium';
  suspended: boolean;
  createdAt: string;
}

export interface AdminRoomRow {
  name: string;
  slug: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  listing: ListingStatus;
  approvedCount: number;
  maxGuests: number;
  endsIn: string;
  reportCount: number;
}

export interface AdminReportRow {
  roomName: string;
  roomSlug: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  listing: ListingStatus;
  /** Pelapor unik — satu pelapor dihitung sekali (D-20). Ambang: report_hide_threshold. */
  uniqueReports: number;
  reasons: string[];
  lastReportAt: string;
}

export interface AdminAuditEntry {
  at: string;
  /** Kode aksi senada RPC Admin (admin_rename_handle, admin_suspend_user, dst.). */
  action: string;
  target: string;
  actor: string;
  result: 'berhasil' | 'ditolak';
}

export const adminUsers: AdminUserRow[] = [
  {
    handle: 'bem.kampus',
    handleVerified: true,
    role: 'host',
    tier: 'free',
    suspended: false,
    createdAt: '3 bulan lalu',
  },
  {
    handle: 'd7k2pRm8x',
    handleVerified: false,
    role: 'host',
    tier: 'premium',
    suspended: false,
    createdAt: '5 minggu lalu',
  },
  {
    handle: 'w9tZq4jNn',
    handleVerified: false,
    role: 'admin',
    tier: 'premium',
    suspended: false,
    createdAt: '2 bulan lalu',
  },
  {
    handle: 'f2x6j9c4v',
    handleVerified: false,
    role: 'guest',
    tier: 'free',
    suspended: false,
    createdAt: '12 hari lalu',
  },
  {
    handle: 'wu32t76e3',
    handleVerified: false,
    role: 'guest',
    tier: 'free',
    suspended: false,
    createdAt: '9 hari lalu',
  },
  {
    handle: 'm3r7t5p2d',
    handleVerified: false,
    role: 'host',
    tier: 'free',
    suspended: true,
    createdAt: '1 bulan lalu',
  },
  {
    handle: 'k7v9m2qx1',
    handleVerified: false,
    role: 'guest',
    tier: 'free',
    suspended: false,
    createdAt: '6 hari lalu',
  },
  {
    handle: 'l4b8uVq3w',
    handleVerified: true,
    role: 'host',
    tier: 'premium',
    suspended: false,
    createdAt: '4 bulan lalu',
  },
];

export const adminRooms: AdminRoomRow[] = [
  {
    name: 'Curhat Akhir Semester',
    slug: 'j9qXc2Lm7BvHt4kd',
    visibility: 'PUBLIC',
    listing: 'LISTED',
    approvedCount: 23,
    maxGuests: 40,
    endsIn: 'berakhir 6 hari',
    reportCount: 1,
  },
  {
    name: 'Kuis Malam Bonus',
    slug: 'm4kP2rVt9wQsJz1x',
    visibility: 'PUBLIC',
    listing: 'HIDDEN',
    approvedCount: 40,
    maxGuests: 40,
    endsIn: 'berakhir 2 hari',
    reportCount: 3,
  },
  {
    name: 'Tim Esports Kampus',
    slug: 'n8sWb6Kp3TdmYz9h',
    visibility: 'PUBLIC',
    listing: 'LISTED',
    approvedCount: 40,
    maxGuests: 40,
    endsIn: 'berakhir 5 hari',
    reportCount: 0,
  },
  {
    name: 'Kilat Balapan Liar',
    slug: 'q6tNv3mZ8KxRpd2w',
    visibility: 'PUBLIC',
    listing: 'BANNED',
    approvedCount: 14,
    maxGuests: 40,
    endsIn: 'berakhir 4 hari',
    reportCount: 7,
  },
  {
    name: 'Rapat & Koordinasi KKN',
    slug: 'k3tK9mQp2weR7uds',
    visibility: 'PRIVATE',
    listing: 'HIDDEN',
    approvedCount: 12,
    maxGuests: 40,
    endsIn: 'berakhir 6 hari',
    reportCount: 0,
  },
  {
    name: 'Musyawarah Persewaan',
    slug: 'pN4rFzK7bWqM8jcD',
    visibility: 'PRIVATE',
    listing: 'HIDDEN',
    approvedCount: 18,
    maxGuests: 25,
    endsIn: 'arsip 14 hari lagi',
    reportCount: 0,
  },
];

export const adminReports: AdminReportRow[] = [
  {
    roomName: 'Kuis Malam Bonus',
    roomSlug: 'm4kP2rVt9wQsJz1x',
    visibility: 'PUBLIC',
    listing: 'HIDDEN',
    uniqueReports: 4,
    reasons: ['SPAM', 'SPAM', 'OTHER', 'SPAM'],
    lastReportAt: '13 menit lalu',
  },
  {
    roomName: 'Kilat Balapan Liar',
    roomSlug: 'q6tNv3mZ8KxRpd2w',
    visibility: 'PUBLIC',
    listing: 'BANNED',
    uniqueReports: 7,
    reasons: ['ILLEGAL', 'ABUSE', 'ILLEGAL', 'ABUSE', 'OTHER'],
    lastReportAt: '1 jam lalu',
  },
  {
    roomName: 'Curhat Akhir Semester',
    roomSlug: 'j9qXc2Lm7BvHt4kd',
    visibility: 'PUBLIC',
    listing: 'LISTED',
    uniqueReports: 1,
    reasons: ['ABUSE'],
    lastReportAt: '2 jam lalu',
  },
  {
    roomName: 'Rapat & Koordinasi KKN',
    roomSlug: 'k3tK9mQp2weR7uds',
    visibility: 'PRIVATE',
    listing: 'HIDDEN',
    uniqueReports: 2,
    reasons: ['OTHER', 'OTHER'],
    lastReportAt: 'kemarin',
  },
  {
    roomName: 'Latihan Korps Drum Band',
    roomSlug: 'g5Tz8wMq2BfxLr4y',
    visibility: 'PUBLIC',
    listing: 'LISTED',
    uniqueReports: 2,
    reasons: ['SPAM', 'OTHER'],
    lastReportAt: '2 hari lalu',
  },
];

export const adminAuditLog: AdminAuditEntry[] = [
  {
    at: '10:41',
    action: 'admin_set_listing',
    target: 'Kilat Balapan Liar',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
  {
    at: '10:39',
    action: 'admin_suspend_user',
    target: 'm3r7t5p2d',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
  {
    at: '10:31',
    action: 'admin_rename_handle',
    target: 'l4b8uVq3w → alumni.pkJl',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
  {
    at: '10:22',
    action: 'admin_rename_handle',
    target: 'beranda.resmi → ditolak',
    actor: 'w9tZq4jNn',
    result: 'ditolak',
  },
  {
    at: '09:58',
    action: 'admin_set_tier',
    target: 'd7k2pRm8x → premium',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
  {
    at: '09:40',
    action: 'admin_close_room',
    target: 'Musyawarah Persewaan',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
  {
    at: '09:12',
    action: 'admin_set_listing',
    target: 'Kuis Malam Bonus → HIDDEN',
    actor: 'w9tZq4jNn',
    result: 'berhasil',
  },
];

/** Label Indonesia untuk status katalog room (S-21/S-22; kolom `listing_status`). */
export const listingLabels: Record<ListingStatus, string> = {
  LISTED: 'Tampak di FYP',
  HIDDEN: 'Tersembunyi',
  BANNED: 'Diblokir',
};
