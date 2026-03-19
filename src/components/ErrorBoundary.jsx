import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary${this.props.zone ? ` ${this.props.zone}` : ''}]`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          onReset: this.handleReset,
        })
      }

      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-800">
            Something went wrong{this.props.zone ? ` in ${this.props.zone}` : ''}.
          </p>
          <p className="text-xs text-red-600">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50"
            onClick={this.handleReset}
          >
            Reload this panel
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
