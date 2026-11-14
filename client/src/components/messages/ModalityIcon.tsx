import React from 'react';
import type { Modality } from '@app/shared';
import { FileText, Video, Headphones, Image as ImageIcon, FileCode, Paperclip } from 'lucide-react';

export interface ModalityIconProps {
  modality?: Modality | string;
  size?: number;
  className?: string;
}

export function ModalityIcon({ modality, size = 14, className }: ModalityIconProps) {
  switch (modality) {
    case 'pdf':
      return <FileText size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
    case 'video':
      return <Video size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
    case 'audio':
      return <Headphones size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
    case 'image':
      return <ImageIcon size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
    case 'text':
      return <FileCode size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
    default:
      return <Paperclip size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
  }
}
