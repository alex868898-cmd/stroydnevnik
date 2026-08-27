import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export interface ReceiptAttachment {
  id: string;
  total: number;
  vendor: string | null;
  storage_path: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function pickAndRecognizeReceipt() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const originalAsset = result.assets[0];
  const context = ImageManipulator.manipulate(originalAsset.uri);
  const rendered = await context.renderAsync();
  const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
  const asset: ImagePicker.ImagePickerAsset = { ...originalAsset, uri: normalized.uri, base64: normalized.base64 || null, mimeType: 'image/jpeg' };
  if (!asset.base64) throw new Error('Не вдалося прочитати зображення чека');

  const mimeType = asset.mimeType || 'image/jpeg';
  const { data, error } = await supabase.functions.invoke('receipt-ocr', {
    body: { imageBase64: asset.base64, mimeType },
  });
  if (error) throw new Error('Розпізнавання чеків ще не підключене в Supabase');
  const total = Number(data?.total);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Не вдалося визначити підсумкову суму чека');
  return { asset, total, vendor: data?.vendor || null, receiptDate: data?.date || null };
}

export async function saveReceipt(params: {
  asset: ImagePicker.ImagePickerAsset;
  projectId: string | null;
  workLogId: string;
  total: number;
  vendor: string | null;
  receiptDate: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Потрібно увійти в обліковий запис');
  const extension = params.asset.mimeType?.includes('png') ? 'png' : 'jpg';
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
  const bytes = await (await fetch(params.asset.uri)).arrayBuffer();
  const { error: uploadError } = await supabase.storage.from('receipts').upload(path, bytes, {
    contentType: params.asset.mimeType || 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from('receipts').insert({
    user_id: user.id,
    project_id: params.projectId,
    work_log_id: params.workLogId,
    storage_path: path,
    total: params.total,
    vendor: params.vendor,
    receipt_date: params.receiptDate,
  });
  if (error) {
    await supabase.storage.from('receipts').remove([path]);
    throw error;
  }
}

export async function getReceiptImages(projectId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase.from('receipts').select('*')
    .eq('project_id', projectId).gte('created_at', `${startDate}T00:00:00`).lte('created_at', `${endDate}T23:59:59`);
  // Reports must remain exportable while the optional receipt backend is not deployed yet.
  if (error?.code === 'PGRST205' || error?.message?.includes("public.receipts")) return [];
  if (error) throw error;
  const images: string[] = [];
  for (const receipt of (data || []) as ReceiptAttachment[]) {
    const { data: signed } = await supabase.storage.from('receipts').createSignedUrl(receipt.storage_path, 120);
    if (!signed?.signedUrl) continue;
    try {
      const response = await fetch(signed.signedUrl);
      if (!response.ok) continue;
      const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      if (!mimeType.startsWith('image/')) continue;
      const originalDataUri = `data:${mimeType};base64,${arrayBufferToBase64(await response.arrayBuffer())}`;
      try {
        const context = ImageManipulator.manipulate(originalDataUri);
        const rendered = await context.renderAsync();
        const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
        images.push(normalized.base64 ? `data:image/jpeg;base64,${normalized.base64}` : originalDataUri);
      } catch {
        if (mimeType === 'image/jpeg' || mimeType === 'image/png') images.push(originalDataUri);
      }
    } catch (error) {
      console.warn('Unable to prepare receipt image for PDF:', receipt.id, error);
    }
  }
  return images;
}
