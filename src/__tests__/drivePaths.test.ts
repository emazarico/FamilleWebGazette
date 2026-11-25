import { describe, expect, it } from 'vitest';
import {
  buildDriveFileViewUrl,
  buildDriveGazetteFilenames,
  buildDrivePhotoPath,
  slugifyDriveSegment,
} from '../utils/drivePaths';

describe('drivePaths utilities', () => {
  it('slugifies accented and punctuated segments cleanly', () => {
    expect(slugifyDriveSegment('Hélène — Mamie!')).toBe('Helene-Mamie');
    expect(slugifyDriveSegment('Gazette d’Hiver N° 01')).toBe('Gazette-d-Hiver-N-01');
    expect(slugifyDriveSegment('   ', 'Fallback')).toBe('Fallback');
    expect(slugifyDriveSegment('VeryLongFamilyAuthorSegmentName', 'Item', 10)).toBe(
      'VeryLongFa',
    );
  });

  it('builds organized YYYY/YYYY-MM/YYYY-MM-DD_Author_id photo paths', () => {
    const info = buildDrivePhotoPath({
      mediaId: 'med-abcdef123456',
      memoryDate: '2026-11-18',
      authorName: 'Hélène',
      mimeType: 'image/webp',
    });

    expect(info).toEqual({
      year: '2026',
      yearMonth: '2026-11',
      fileName: '2026-11-18_Helene_abcdef12.webp',
      relativePath: 'Photos/2026/2026-11/2026-11-18_Helene_abcdef12.webp',
    });

    const jpgInfo = buildDrivePhotoPath({
      mediaId: 'med-zz998877',
      memoryDate: '2026-12-03',
      mimeType: 'image/jpeg',
    });
    expect(jpgInfo.relativePath).toBe('Photos/2026/2026-12/2026-12-03_Famille_zz998877.jpg');
  });

  it('builds clear PDF & HTML filenames inside Gazettes/ and Drive view URLs', () => {
    const names = buildDriveGazetteFilenames({
      issueNumber: 3,
      title: 'Noël chez Mamie Claire',
      periodEnd: '2026-12-25',
    });

    expect(names).toEqual({
      pdfName: '2026-12_N03_Noel-chez-Mamie-Claire.pdf',
      htmlName: '2026-12_N03_Noel-chez-Mamie-Claire.html',
    });

    expect(buildDriveFileViewUrl('1AbC_dEf-99')).toBe(
      'https://drive.google.com/file/d/1AbC_dEf-99/view',
    );
  });
});
