// Upload direct (XHR) vers Supabase Storage avec suivi de progression —
// le client supabase-js n'expose pas de progression sur storage.upload(),
// donc on parle directement à l'API REST pour obtenir les événements xhr.upload.onprogress.
export function uploadFileWithProgress(bucket, path, file, accessToken, onLoaded) {
  return new Promise((resolve, reject) => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onLoaded(file.size); resolve(path); }
      else reject(new Error(`Échec de l'envoi du document (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'envoi du document"));
    xhr.send(file);
  });
}
