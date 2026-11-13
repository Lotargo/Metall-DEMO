export interface OperatorProfile {
  id: string;
  name: string;
  role: string;
  workstation: string;
  organization: string;
}

const OPERATOR_KEY = 'metall-demo.operator-profile';

const DEFAULT_OPERATOR: OperatorProfile = {
  id: 'operator_local',
  name: 'Инженер-технолог',
  role: 'Оператор АРМ',
  workstation: 'WS-01',
  organization: '',
};

export function getOperatorProfile(): OperatorProfile {
  try {
    const raw = localStorage.getItem(OPERATOR_KEY);
    if (raw) {
      return { ...DEFAULT_OPERATOR, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to read operator profile from localStorage', e);
  }
  return DEFAULT_OPERATOR;
}

export function saveOperatorProfile(profile: OperatorProfile): boolean {
  try {
    localStorage.setItem(OPERATOR_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event('operator-profile-changed'));
    return true;
  } catch (e) {
    console.error('Failed to save operator profile to localStorage', e);
    return false;
  }
}
