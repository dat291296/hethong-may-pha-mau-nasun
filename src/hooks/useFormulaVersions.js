import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, safeQuery } from '../lib/supabase.js';
import { INITIAL_FORMULA_VERSIONS } from '../data/mockData.js';

export function useFormulaVersions() {
  const [formulaVersions, setFormulaVersions] = useState(INITIAL_FORMULA_VERSIONS);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await safeQuery(
      sb => sb.from('formula_versions').select('*').order('release_date', { ascending: false }),
      'fetchVersions'
    );
    if (error) {
      console.warn('Không thể kết nối Supabase lấy dữ liệu formula_versions. Dùng dữ liệu đệm.');
    } else if (data && data.length > 0) {
      // Group by version_group hoặc title
      const groups = {};
      data.forEach(row => {
        const key = row.version_group || row.title;
        if (!groups[key]) {
          groups[key] = {
            versionId: row.version_group || row.version_id,
            title: row.title,
            releaseDate: row.release_date,
            author: row.author,
            notes: row.notes,
            files: {
              colorExpert2: { filename: 'N/A', size: '—', checksum: '—' },
              colorExpert3: { filename: 'N/A', size: '—', checksum: '—' },
              corobTint: { filename: 'N/A', size: '—', checksum: '—' },
            }
          };
        }
        
        if (row.software_type === 'ColorExpert 2') {
          groups[key].files.colorExpert2 = { filename: row.filename, size: '4.2 MB', downloadUrl: row.download_url };
        } else if (row.software_type === 'ColorExpert 3') {
          groups[key].files.colorExpert3 = { filename: row.filename, size: '6.8 MB', downloadUrl: row.download_url };
        } else if (row.software_type === 'CorobTINT') {
          groups[key].files.corobTint = { filename: row.filename, size: '3.5 MB', downloadUrl: row.download_url };
        }
      });
      
      setFormulaVersions(Object.values(groups));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return {
    formulaVersions,
    loading,
    refetch: fetchVersions
  };
}
