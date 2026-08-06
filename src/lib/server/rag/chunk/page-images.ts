import sharp from 'sharp';

const PAINT_IMAGE_XOBJECT = 85;
const PAINT_INLINE_IMAGE_XOBJECT = 86;

const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;
const RGBA_32BPP = 3;

export type PageImage = {
	name: string;
	width: number;
	height: number;
	data: Buffer;
};

type RawImage = {
	width?: number;
	height?: number;
	kind?: number;
	data?: Uint8Array | Uint8ClampedArray;
};

type PdfObjects = {
	get(objId: string, callback: (data: unknown) => void): unknown;
};

export type PdfPage = {
	getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
	objs: PdfObjects;
	commonObjs: PdfObjects;
};

export type PdfDocument = {
	getPage(pageNumber: number): Promise<PdfPage>;
};

function expandBlackAndWhite(src: Buffer, width: number, height: number): Buffer {
	const expanded = Buffer.allocUnsafe(width * height);
	const fullBytes = width >> 3;
	const remainder = width & 7;
	let read = 0;
	let write = 0;

	for (let row = 0; row < height; row += 1) {
		for (let byteIndex = 0; byteIndex < fullBytes; byteIndex += 1) {
			const byte = read < src.length ? src[read] : 0xff;
			read += 1;
			for (let bit = 7; bit >= 0; bit -= 1) expanded[write++] = (byte >> bit) & 1 ? 255 : 0;
		}
		if (remainder === 0) continue;

		const byte = read < src.length ? src[read] : 0xff;
		read += 1;
		for (let bit = 0; bit < remainder; bit += 1) {
			expanded[write++] = (byte >> (7 - bit)) & 1 ? 255 : 0;
		}
	}

	return expanded;
}

type RawPixels = {
	channels: 1 | 3 | 4;
	data: Buffer;
	height: number;
	width: number;
};

function rawPixels(image: RawImage): RawPixels | null {
	const { width, height, kind, data } = image;
	if (!data || !width || !height) return null;

	const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	if (kind === GRAYSCALE_1BPP) {
		return { data: expandBlackAndWhite(bytes, width, height), channels: 1, height, width };
	}
	if (kind === RGB_24BPP) return { data: bytes, channels: 3, height, width };
	if (kind === RGBA_32BPP) return { data: bytes, channels: 4, height, width };

	const perPixel = bytes.length / (width * height);
	if (perPixel === 1) return { data: bytes, channels: 1, height, width };
	if (perPixel === 3) return { data: bytes, channels: 3, height, width };
	if (perPixel === 4) return { data: bytes, channels: 4, height, width };
	return null;
}

async function toPng(image: RawImage): Promise<Omit<PageImage, 'name'> | null> {
	const pixels = rawPixels(image);
	if (!pixels) return null;

	const { width, height, channels } = pixels;
	const data = await sharp(pixels.data, { raw: { width, height, channels } }).png().toBuffer();
	return { data, height, width };
}

function resolveImage(page: PdfPage, name: string): Promise<RawImage | null> {
	const container = name.startsWith('g_') ? page.commonObjs : page.objs;
	return new Promise((resolve) => {
		container.get(name, (data) => resolve((data as RawImage) ?? null));
	});
}

export async function extractPageImages(
	document: PdfDocument,
	pageNumber: number
): Promise<PageImage[]> {
	const page = await document.getPage(pageNumber);
	const { fnArray, argsArray } = await page.getOperatorList();

	const images: PageImage[] = [];
	const seen = new Set<string>();

	for (let index = 0; index < fnArray.length; index += 1) {
		const operator = fnArray[index];
		const isInline = operator === PAINT_INLINE_IMAGE_XOBJECT;
		if (!isInline && operator !== PAINT_IMAGE_XOBJECT) continue;

		const operand = argsArray[index][0];
		const name = isInline ? `inline_p${pageNumber}_${images.length + 1}` : String(operand);
		if (seen.has(name)) continue;
		seen.add(name);

		const raw = isInline ? (operand as RawImage) : await resolveImage(page, name);
		if (!raw) continue;

		const png = await toPng(raw);
		if (!png) continue;

		images.push({ name, ...png });
	}

	return images;
}
