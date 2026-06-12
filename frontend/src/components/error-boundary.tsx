/**
 * ErrorBoundary - Catches React errors and displays user-friendly fallback UI
 * Prevents the entire app from crashing when a component throws an error
 */

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo })

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught an error:", error, errorInfo)
    }

    // TODO: Send to error monitoring service (Sentry, LogRocket, etc.)
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleGoHome = () => {
    window.location.href = "/"
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback provided by parent
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md space-y-6 rounded-xl border border-destructive/40 bg-card p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">
                  An unexpected error occurred
                </p>
              </div>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="space-y-2">
                <details className="rounded-lg border border-border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Error details (dev only)
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div>
                      <strong className="text-destructive">Error:</strong>
                      <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[10px]">
                        {this.state.error.toString()}
                      </pre>
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong className="text-destructive">Component Stack:</strong>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-[10px]">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You can try reloading this page, or return to the home page.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={this.handleReset}
                  variant="default"
                  size="sm"
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 size-4" />
                  Try again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Home className="mr-2 size-4" />
                  Go home
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook-based alternative for functional components that need error boundaries
 * Wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}
