import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="ui-error-state">
          <div className="ui-error-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
          <h2 className="ui-error-title">Произошла ошибка интерфейса</h2>
          <p className="ui-error-message">
            Не удалось отобразить раздел. Перезагрузите страницу или вернитесь к проектам.
          </p>
          <div className="ui-error-actions">
            <Button size="sm" variant="primary" onClick={this.handleReset} icon={<RotateCw className="w-3.5 h-3.5" />}>
              Перезагрузить страницу
            </Button>
            <a href="/projects" className="ui-error-link">
              Вернуться к проектам
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
