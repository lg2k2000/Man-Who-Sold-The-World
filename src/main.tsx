import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MemoryStore } from './data/store';
import { useApp } from './state/app';
import type { Dataset } from './data/types';
import './styles.css';

async function chooseStore() {
  // ?sample=1 loads the fake fixtures into memory; nothing is saved.
  if (new URLSearchParams(location.search).has('sample')) {
    const { default: sample } = await import('../fixtures/sample/dataset.json');
    return new MemoryStore(sample as Dataset);
  }
  return new MemoryStore();
}

chooseStore().then((store) => useApp.getState().attachStore(store));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
