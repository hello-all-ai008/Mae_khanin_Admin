import { useRace } from '../context/RaceContext';

export default function Toast() {
  const { toastMsg } = useRace();

  return (
    <div className={`toast ${toastMsg ? 'show' : ''} ${toastMsg?.err ? 'err' : ''}`}>
      {toastMsg?.msg}
    </div>
  );
}
