import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [authInfo, setAuthInfo] = useState(null)

  useEffect(() => {
    let isMounted = true

    const loadSession = async () => {
      setIsAuthenticating(true)
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!isMounted) {
          return
        }

        if (error) {
          setAuthError(error.message)
          setUser(null)
        } else {
          setUser(data.session?.user ?? null)
          setAuthError(null)
        }
      } catch (error) {
        if (isMounted) {
          setAuthError(error.message)
        }
      } finally {
        if (isMounted) {
          setIsAuthenticating(false)
        }
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthError(null)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email, password) => {
    setIsAuthenticating(true)
    setAuthError(null)
    setAuthInfo(null)

    try {
      const { data, error } = await supabase.auth.signUp({ email, password })

      if (error) {
        setAuthError(error.message)
        return { data: null, error }
      }

      if (!data.session) {
        setAuthInfo('Sign up successful. Please verify your email before logging in.')
      }

      setUser(data.session?.user ?? null)
      return { data, error: null }
    } catch (error) {
      setAuthError(error.message)
      return { data: null, error }
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    setIsAuthenticating(true)
    setAuthError(null)
    setAuthInfo(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setAuthError(error.message)
        return { data: null, error }
      }

      setUser(data.user ?? null)
      return { data, error: null }
    } catch (error) {
      setAuthError(error.message)
      return { data: null, error }
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setIsAuthenticating(true)
    setAuthError(null)
    setAuthInfo(null)

    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setAuthError(error.message)
        return { data: null, error }
      }

      setUser(null)
      return { data: true, error: null }
    } catch (error) {
      setAuthError(error.message)
      return { data: null, error }
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  return {
    user,
    isAuthenticating,
    authError,
    authInfo,
    setAuthError,
    setAuthInfo,
    signUp,
    signIn,
    signOut,
  }
}
