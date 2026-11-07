import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {ExperienceProvider} from './components/Experience';
import '@fontsource-variable/noto-sans-kr';
import './styles.css';
import './experience.css';
createRoot(document.getElementById('root')!).render(<StrictMode><ExperienceProvider><App/></ExperienceProvider></StrictMode>);

