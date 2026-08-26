import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import RunnersList from './pages/RunnersList';
import ImportRunners from './pages/ImportRunners';
import CheckIn from './pages/CheckIn';
import CheckPoint from './pages/CheckPoint';
import FinishLine from './pages/FinishLine';
import ScanLog from './pages/ScanLog';
import Toast from './components/Toast';
import DatabaseFlow from './pages/DatabaseFlow';
import BibCanvas from './pages/BibCanvas';
import EventManager from './pages/EventManager';
import StaffManager from './pages/StaffManager';

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<EventManager />} />
          <Route path="/staff" element={<StaffManager />} />
          <Route path="/runners" element={<RunnersList />} />
          <Route path="/import" element={<ImportRunners />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/checkpoint" element={<CheckPoint />} />
          <Route path="/finish" element={<FinishLine />} />
          <Route path="/log" element={<ScanLog />} />
          <Route path="/bib-canvas" element={<BibCanvas />} />
          <Route path="/database-flow" element={<DatabaseFlow />} />
        </Routes>
      </main>
      <Toast />
    </div>
  );
}

export default App;
