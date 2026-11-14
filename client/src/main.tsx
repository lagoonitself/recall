import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ModalitySchema } from '@app/shared';
import './style.css';
const apiUrl = import.meta.env.VITE_API_URL;
function Home() { return <main className="mx-auto max-w-3xl px-6 py-24"><p className="text-sm text-slate-500">Your library</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">Ask your materials.</h1><p className="mt-5 max-w-xl text-slate-600">Documents, images, audio and video will come together here.</p><p className="mt-12 text-sm text-slate-500">Foundation ready for {ModalitySchema.options.length} media types{apiUrl ? '.' : ' ? API URL not configured.'}</p></main>; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><Routes><Route path="/" element={<Home />} /></Routes></BrowserRouter></React.StrictMode>);
