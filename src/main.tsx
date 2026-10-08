import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConfigError, ErrorBoundary } from './ui/ErrorBoundary';
import { configProblems } from './config';
import { MemoryStore } from './data/store';
import { IndexedDbStore } from './data/idb';
import { useApp } from './state/app';
import type { Dataset } from './data/types';
import './styles.css';

async function chooseStore() {
  // ?sample=1 loads the fake fixtures into memory; nothing is saved.
  // ?sample=stress triples the sample companies to test drawing speed.
  const sampleParam = new URLSearchParams(location.search).get('sample');
  if (sampleParam !== null) {
    const { default: sample } = await import('../fixtures/sample/dataset.json');
    const data = sample as unknown as Dataset;
    if (sampleParam === 'stress') data.companies = stressCopies(data.companies, 3);
    return { store: new MemoryStore(data), problem: null };
  }
  try {
    const store = new IndexedDbStore();
    await store.load();
    return { store, problem: null };
  } catch {
    return {
      store: new MemoryStore(),
      problem: {
        message:
          'This browser blocked storage (a private window or a site-data setting), so imports last only until this tab closes. Use Export everything in Data to keep a copy.',
      },
    };
  }
}

function stressCopies(list: Dataset['companies'], times: number): Dataset['companies'] {
  const out = [...list];
  for (let t = 1; t < times; t++) {
    for (const p of list.filter((c) => c.type !== 'partner')) {
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

chooseStore().then(({ store, problem }) => useApp.getState().attachStore(store, problem));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>{configProblems.length ? <ConfigError problems={configProblems} /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
