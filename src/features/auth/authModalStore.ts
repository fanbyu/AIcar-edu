// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';

interface AuthModalState {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
}));
