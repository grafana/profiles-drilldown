import { useState } from 'react';

type PanelId = 'ai' | 'function-details' | 'classification' | null;

type OnOpenHandler = () => void;

type SidePanel = {
  onOpen: (handler: OnOpenHandler) => void;
  isOpen: (panelId: PanelId) => boolean;
  open: (panelId: PanelId) => void;
  close: () => void;
};

export function useToggleSidePanel(): SidePanel {
  const [openPanelId, setOpenPanelId] = useState<PanelId>(null);
  const [onOpenHandler, setOnOpenHandler] = useState<OnOpenHandler>();

  return {
    onOpen(handler: OnOpenHandler) {
      setOnOpenHandler(() => handler);
    },
    isOpen(panelId: PanelId) {
      return panelId === openPanelId;
    },
    open(panelId: PanelId) {
      setOpenPanelId(panelId);
      onOpenHandler?.();
    },
    close() {
      setOpenPanelId(null);
    },
  };
}
