import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MemoryStore } from './data/store';
import { useApp } from './state/app';
import type { Dataset } from './data/types';
import './styles.css';

async function chooseStore() {
  // ?sample=1 loads the fake fixtures into memory; nothing is saved.
  // ?sample=stress triples the sample prospects to test drawing speed.
  const sampleParam = new URLSearchParams(location.search).get('sample');
  if (sampleParam !== null) {
    const { default: sample } = await import('../fixtures/sample/dataset.json');
    const data = sample as Dataset;
    if (sampleParam === 'stress') data.prospects = stressCopies(data.prospects, 3);
    return new MemoryStore(data);
  }
  return new MemoryStore();
}

function stressCopies(list: Dataset['prospects'], times: number): Dataset['prospects'] {
  const out = [...list];
  for (let t = 1; t < times; t++) {
    for (const p of list) {
      out.push({
        ...p,
        id: `${p.id}-x${t}`,
        name: `${p.name} copy ${t}`,
        lat: p.lat === null ? null : p.lat + 0.3 * t,
        lng: p.lng === null ? null : p.lng - 0.4 * t,
      });
    }
  }
  return out;
}

chooseStore().then((store) => useApp.getState().attachStore(store));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
