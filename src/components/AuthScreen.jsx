import { useState } from 'react'
import logo from '../assets/dojobuild-logo.svg'

function AuthScreen({
  onSignIn,
  onSignUp,
  onContinueWithGoogle,
  onResendConfirmation,
  isAuthenticating,
  authError,
  authInfo,
}) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const isLoginMode = mode === 'login'

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isLoginMode) {
      await onSignIn(email, password)
      return
    }

    await onSignUp(email, password, username)
  }

  const handleResendConfirmation = async () => {
    await onResendConfirmation(email)
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:grid lg:grid-cols-2">
          <div className="flex flex-col items-center justify-center gap-8 bg-gradient-to-br from-sky-100 via-cyan-50 to-teal-100 px-6 py-12 text-center sm:px-10 lg:py-16">
            <img
              src={logo}
              alt="DojoBuild logo"
              className="h-20 w-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            />
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">DojoBuild</h1>
              <p className="mt-3 text-lg text-slate-700">
                Your AI dojo for learning how to build.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:px-10">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="rounded-xl bg-slate-100 p-1">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    disabled={isAuthenticating}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isLoginMode
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    disabled={isAuthenticating}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      mode === 'signup'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              <header className="mt-6 text-center">
                <h2 className="text-3xl font-bold text-slate-900">
                  {isLoginMode ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {isLoginMode
                    ? 'Continue your learning journey'
                    : 'Start your learning journey today'}
                </p>
              </header>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                {!isLoginMode ? (
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                    Username
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                      className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      placeholder="Enter your username"
                    />
                  </label>
                ) : null}

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="h-12 rounded-xl border border-slate-300 px-3 text-base outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="••••••••"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="mt-1 h-12 rounded-xl bg-slate-900 px-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isAuthenticating
                    ? 'Authenticating...'
                    : isLoginMode
                      ? 'Log In'
                      : 'Sign Up'}
                </button>

                {!isLoginMode ? (
                  <button
                    type="button"
                    disabled={isAuthenticating || !email.trim()}
                    className="self-center text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                    onClick={handleResendConfirmation}
                  >
                    Resend confirmation email
                  </button>
                ) : null}
              </form>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Or continue with
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                disabled={isAuthenticating}
                onClick={onContinueWithGoogle}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M21.35 11.1h-9.18v2.98h5.27c-.41 2.34-2.4 3.45-5.26 3.45a5.53 5.53 0 1 1 0-11.06c1.59 0 3 .56 4.11 1.66l2.08-2.08a8.56 8.56 0 1 0-6.19 14.62c4.9 0 8.13-3.44 8.13-8.28 0-.55-.05-.94-.16-1.29Z"
                    fill="currentColor"
                  />
                </svg>
                Continue with Google
              </button>

              <p className="mt-6 text-center text-sm text-slate-600">
                {isLoginMode ? 'Don&apos;t have an account?' : 'Already have an account?'}{' '}
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => setMode(isLoginMode ? 'signup' : 'login')}
                  className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-700 disabled:text-slate-400"
                >
                  {isLoginMode ? 'Sign up' : 'Log in'}
                </button>
              </p>

              {authError ? <p className="mt-4 text-sm text-red-600">{authError}</p> : null}
              {authInfo ? <p className="mt-4 text-sm text-green-700">{authInfo}</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default AuthScreen
