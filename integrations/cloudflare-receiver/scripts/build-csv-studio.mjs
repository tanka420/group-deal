import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';

// Build-time ZIP: no new runtime dependency, network request or public asset route.
const source = new URL('../../../samples/license-key-csv-studio/', import.meta.url);
const files = await Promise.all(['CSV_STUDIO.html', 'CSV_MINH_HOA.csv'].map(async name =>
  [name, await readFile(new URL(name, source))]));
const license = (await readFile(new URL('LICENSE.txt', source), 'utf8'))
  .replace('Cửa sổ xác nhận mã để tải gói\r\nlà 30 ngày kể từ thời điểm giao.',
    'Cửa sổ tải bằng đường dẫn riêng\r\nlà 30 ngày kể từ khi provider cấp quyền theo order.committed.')
  .replace('Cửa sổ xác nhận mã để tải gói\nlà 30 ngày kể từ thời điểm giao.',
    'Cửa sổ tải bằng đường dẫn riêng\nlà 30 ngày kể từ khi provider cấp quyền theo order.committed.')
  .replace('LICENSE_KEY cấp quyền nhận tài nguyên', 'Đường dẫn tải riêng cấp quyền nhận tài nguyên');
if (license.includes('Cửa sổ xác nhận mã')) throw new Error('CSV_STUDIO_LICENSE_TEMPLATE_CHANGED');
files.push(['LICENSE.txt', Buffer.from(license)]);
files.push(['README.txt', Buffer.from('GROUPDEAL CSV STUDIO 1.0 — WEBHOOK UAT\r\n\r\n'
  + 'Mở CSV_STUDIO.html bằng Chrome hoặc Edge; chọn CSV UTF-8 để xem, lọc và xuất.\r\n'
  + 'Tệp được xử lý trên máy, không tải lên máy chủ. Đọc LICENSE.txt trước khi dùng.\r\n'
  + 'Đường dẫn tải riêng do provider cấp theo đơn UAT thay cho bước nhập LICENSE_KEY.\r\n'
  + 'Cửa sổ tải 30 ngày từ khi provider cấp; đây không phải DRM cho bản đã tải.\r\n'
  + 'Không chia sẻ đường dẫn; quyền tài chính của order được xử lý riêng trên GroupDeal.\r\n')]);
// The existing permission covers the same project-owned version 1.0 contents.
// A new WEBHOOK product/version still needs its own operator review before publication.
const crc = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) {n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (0xedb88320 & -(n & 1));}
  return (n ^ 0xffffffff) >>> 0;
};
const local = [], central = []; let offset = 0;
for (const [name, raw] of files) {
  const filename = Buffer.from(name), packed = deflateRawSync(raw, {level: 9}), checksum = crc(raw);
  const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4);
  head.writeUInt16LE(8, 8); head.writeUInt16LE(33, 12); head.writeUInt32LE(checksum, 14);
  head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(filename.length, 26);
  const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14);
  directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(packed.length, 20);
  directory.writeUInt32LE(raw.length, 24); directory.writeUInt16LE(filename.length, 28);
  directory.writeUInt32LE(offset, 42); local.push(head, filename, packed); central.push(directory, filename);
  offset += head.length + filename.length + packed.length;
}
const centralBytes = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, centralBytes, end]);
await mkdir(new URL('../.cache/', import.meta.url), {recursive: true});
await writeFile(new URL('../.cache/csv-studio.zip', import.meta.url), zip);
await writeFile(new URL('../.cache/csv-studio-package.mjs', import.meta.url),
  'export const packageBase64 = ' + JSON.stringify(zip.toString('base64')) + ';\n'
  + 'export const packageSha256 = ' + JSON.stringify(createHash('sha256').update(zip).digest('hex')) + ';\n');
