export const COLLEGES = {
  canada: {
    label: 'Cañada College',
    abbr: 'CA',
    color: '#4ade80',
    dim: '#1a3d25',
  },
  csm: {
    label: 'College of San Mateo',
    abbr: 'CSM',
    color: '#60a5fa',
    dim: '#1a2d4a',
  },
  skyline: {
    label: 'Skyline College',
    abbr: 'SKY',
    color: '#fb923c',
    dim: '#3d2010',
  },
}

// Flat colors used in legend and tree
export const CATEGORY_COLORS = {
  internship: '#a78bfa',
  scholarship: '#34d399',
  club: '#f472b6',
  event: '#fbbf24',
  other: '#94a3b8',
}

export const CATEGORY_SYMBOLS = {
  internship: '⚡',
  scholarship: '✦',
  club: '◈',
  event: '◉',
  other: '·',
}

export const CATEGORIES = ['internship', 'scholarship', 'club', 'event', 'other']

// Blacklist filter categories — hide what you don't want to see
export const FILTER_CATEGORIES = [
  { id: 'internship', label: 'Internships', color: '#a78bfa', keys: ['internship','intern','co-op','work experience','job shadowing'] },
  { id: 'scholarship', label: 'Scholarships', color: '#34d399', keys: ['scholarship','grant','financial aid','funding','tuition','bursary'] },
  { id: 'club', label: 'Clubs', color: '#f472b6', keys: ['club','organization','society','group','team','association'] },
  { id: 'event', label: 'Events', color: '#fbbf24', keys: ['event','workshop','seminar','info session','meeting','conference','fair'] },
  { id: 'cs', label: 'Computer Science', color: '#22d3ee', keys: ['computer science','software','programming','coding','developer','data science','machine learning','artificial intelligence','web development','cybersecurity'] },
  { id: 'engineering', label: 'Engineering', color: '#f97316', keys: ['engineering','mechanical','electrical','civil','aerospace','robotics','structural'] },
  { id: 'business', label: 'Business', color: '#10b981', keys: ['business','accounting','finance','marketing','management','entrepreneurship','economics','mba','startup'] },
  { id: 'health', label: 'Health Sciences', color: '#8b5cf6', keys: ['health','nursing','medical','biology','pre-med','pharmacy','kinesiology','public health','clinical','anatomy'] },
  { id: 'arts', label: 'Arts & Design', color: '#ec4899', keys: ['art ','design','photography','graphic','ux ','ui ','film','theater','music','animation','illustration'] },
  { id: 'stem', label: 'STEM', color: '#f59e0b', keys: ['stem','mathematics','math','physics','chemistry','statistics','data analysis','research'] },
  { id: 'social', label: 'Social Sciences', color: '#6366f1', keys: ['social work','psychology','sociology','criminal justice','political science','anthropology','human services'] },
  { id: 'education', label: 'Education', color: '#22c55e', keys: ['education','teaching','early childhood','tutoring','academic'] },
  { id: 'environment', label: 'Environment', color: '#14b8a6', keys: ['environment','sustainability','ecology','climate','renewable','green energy'] },
  { id: 'communications', label: 'Communications', color: '#a855f7', keys: ['communications','journalism','media','writing','english','public relations','broadcasting'] },
  { id: 'culinary', label: 'Culinary Arts', color: '#ef4444', keys: ['culinary','cooking','food','restaurant','hospitality'] },
]
