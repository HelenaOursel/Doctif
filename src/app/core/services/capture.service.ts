import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedImage {
  blob: Blob;
  /** Nom de fichier synthétique : le classement s'appuie sur son extension. */
  fileName: string;
}

/**
 * Prise de vue et import d'image.
 *
 * Sur mobile, `<input type="file" capture>` ouvre un sélecteur système au
 * comportement inégal selon les constructeurs et ne donne accès ni au recadrage
 * ni à la compression. `@capacitor/camera` ouvre l'appareil photo natif et gère
 * lui-même la demande de permission.
 *
 * Sur le web le plugin n'a pas d'équivalent utilisable : `isAvailable` renvoie
 * `false` et l'appelant conserve son `<input type="file">`.
 */
@Injectable({ providedIn: 'root' })
export class CaptureService {
  readonly isAvailable = Capacitor.isNativePlatform();

  /** Ouvre l'appareil photo. `null` si l'utilisateur annule. */
  async takePhoto(): Promise<CapturedImage | null> {
    return this.pick(CameraSource.Camera, 'photo');
  }

  /** Ouvre la galerie. `null` si l'utilisateur annule. */
  async pickFromGallery(): Promise<CapturedImage | null> {
    return this.pick(CameraSource.Photos, 'image');
  }

  private async pick(source: CameraSource, prefix: string): Promise<CapturedImage | null> {
    if (!this.isAvailable) return null;
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.Base64,
        // Un document photographié doit rester lisible : on privilégie la
        // définition, quitte à peser plus lourd qu'une photo d'illustration.
        quality: 82,
        correctOrientation: true,
        allowEditing: false,
      });
      if (!photo.base64String) return null;
      const format = photo.format || 'jpeg';
      return {
        blob: base64ToBlob(photo.base64String, `image/${format}`),
        fileName: `${prefix}.${format}`,
      };
    } catch {
      // L'annulation utilisateur et le refus de permission remontent tous deux
      // en exception : dans les deux cas il n'y a simplement rien à traiter.
      return null;
    }
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
