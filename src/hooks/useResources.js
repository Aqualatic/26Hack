import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useResources() {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Initial load
    async function load() {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .order('scraped_at', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setResources(data || [])
      }
      setLoading(false)
    }

    load()

    // Real-time subscription — tree updates live when anyone adds a resource
    const channel = supabase
      .channel('resources-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'resources' },
        (payload) => {
          setResources((prev) => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  function addResource(resource) {
    setResources((prev) => [resource, ...prev])
  }

  return { resources, loading, error, addResource }
}
