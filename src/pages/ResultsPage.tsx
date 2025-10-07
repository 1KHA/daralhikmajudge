import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAnswersBySession, getJudgesBySession } from '../lib/supabaseService';
import type { Answer } from '../types';

interface SessionData {
  session_id: string;
  name: string;
  created_at: string;
  teams: string[];
  total_points: number;
  answers: Answer[];
  judges: any[];
}

interface TeamResult {
  teamName: string;
  score: number;
  answers: Answer[];
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAllSessions();
  }, []);

  const loadAllSessions = async () => {
    try {
      setLoading(true);
      
      // Fetch all sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (sessionsError) throw sessionsError;

      console.log('📊 Loaded sessions:', sessionsData?.length || 0);

      // For each session, fetch answers and judges
      const sessionsWithData = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const [answers, judges] = await Promise.all([
            getAnswersBySession(session.session_id),
            getJudgesBySession(session.session_id)
          ]);
          
          console.log(`Session ${session.session_id}: ${answers.length} answers, ${judges.length} judges`);
          
          return {
            ...session,
            answers,
            judges
          };
        })
      );

      setSessions(sessionsWithData);
      
      // Auto-expand all sessions by default
      const allSessionIds = sessionsWithData.map(s => s.session_id);
      setExpandedSessions(new Set(allSessionIds));
      
      console.log('✅ All sessions loaded and expanded');
    } catch (error) {
      console.error('Error loading sessions:', error);
      alert('خطأ في تحميل الجلسات');
    } finally {
      setLoading(false);
    }
  };

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const calculateTeamResults = (answers: Answer[], judges: any[]): TeamResult[] => {
    const teamScores: { [key: string]: { score: number; answers: Answer[] } } = {};
    
    answers.forEach(answer => {
      if (!teamScores[answer.team_id]) {
        teamScores[answer.team_id] = { score: 0, answers: [] };
      }
      const points = answer.points || 1;
      teamScores[answer.team_id].score += points;
      teamScores[answer.team_id].answers.push(answer);
    });
    
    return Object.entries(teamScores)
      .map(([teamName, data]) => ({ teamName, ...data }))
      .sort((a, b) => b.score - a.score);
  };

  const getJudgeName = (judgeId: string, judges: any[]) => {
    const judge = judges.find(j => j.id === judgeId);
    return judge ? judge.name : judgeId;
  };

  if (loading) {
    return (
      <div className="container">
        <div className="header">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>📊</span>
            نتائج الجلسات
          </h1>
          <button className="btn btn-secondary" onClick={() => navigate('/host')}>
            <span>🔙</span>
            العودة للإدارة
          </button>
        </div>
        <div className="card">
          <div className="empty-state">جاري التحميل...</div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="container">
        <div className="header">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>📊</span>
            نتائج الجلسات
          </h1>
          <button className="btn btn-secondary" onClick={() => navigate('/host')}>
            <span>🔙</span>
            العودة للإدارة
          </button>
        </div>
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
            <h3>لا توجد نتائج متاحة</h3>
            <p>لم يتم إكمال أي جلسات بعد</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>📊</span>
          نتائج الجلسات
        </h1>
        <button className="btn btn-secondary" onClick={() => navigate('/host')}>
          <span>🔙</span>
          العودة للإدارة
        </button>
      </div>

      {sessions.map((session) => {
        const teamResults = calculateTeamResults(session.answers, session.judges);
        const isExpanded = expandedSessions.has(session.session_id);
        const maxScore = teamResults.length > 0 ? teamResults[0].score : 0;
        const avgScore = teamResults.length > 0 
          ? teamResults.reduce((sum, t) => sum + t.score, 0) / teamResults.length 
          : 0;

        return (
          <div key={session.session_id} className="card" style={{ 
            marginBottom: '20px',
            animation: 'slideUp 0.3s ease-out'
          }}>
            {/* Session Header */}
            <div 
              onClick={() => toggleSession(session.session_id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                cursor: 'pointer',
                borderBottom: isExpanded ? '2px solid var(--border-color)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {session.name || `جلسة ${session.session_id}`}
                  </h2>
                  <span style={{
                    background: 'var(--primary-light)',
                    color: 'var(--primary-color)',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    {session.session_id}
                  </span>
                </div>
                <div style={{ 
                  color: 'var(--text-secondary)', 
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>📅</span>
                  {new Date(session.created_at).toLocaleString('ar-SA')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {teamResults.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>فرق</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {session.answers.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>إجابات</div>
                </div>
                <button 
                  className="btn btn-secondary btn-sm"
                  style={{ 
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s'
                  }}
                >
                  <span>▼</span>
                </button>
              </div>
            </div>

            {/* Session Content (Expanded) */}
            {isExpanded && (
              <div style={{ padding: '20px' }}>
                {/* Statistics */}
                <div style={{
                  background: 'var(--primary-light)',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '20px'
                }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--primary-color)', fontSize: '16px' }}>
                    إحصائيات الجلسة
                  </h3>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                    gap: '12px' 
                  }}>
                    <div className="stat-card">
                      <div className="stat-value">{session.teams?.length || 0}</div>
                      <div className="stat-label">عدد الفرق</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{maxScore.toFixed(2)}</div>
                      <div className="stat-label">أعلى نقاط</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{avgScore.toFixed(2)}</div>
                      <div className="stat-label">متوسط النقاط</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{session.judges.length}</div>
                      <div className="stat-label">المحكمون</div>
                    </div>
                  </div>
                </div>

                {/* Team Results */}
                {teamResults.length === 0 ? (
                  <div className="empty-state">
                    <p>لا توجد نتائج لهذه الجلسة</p>
                  </div>
                ) : (
                  <div>
                    <h3 style={{ 
                      marginBottom: '16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      fontSize: '18px',
                      fontWeight: 600
                    }}>
                      <span>🏆</span>
                      نتائج الفرق
                    </h3>
                    
                    {teamResults.map((team, index) => (
                      <div key={team.teamName} style={{
                        background: 'var(--secondary-light)',
                        borderRadius: '8px',
                        padding: '20px',
                        marginBottom: '16px',
                        borderRight: '4px solid var(--primary-color)',
                        transition: 'all 0.2s'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '16px'
                        }}>
                          <h4 style={{
                            fontSize: '18px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            {index === 0 && maxScore > 0 && '🥇'}
                            {index === 1 && '🥈'}
                            {index === 2 && '🥉'}
                            {index > 2 && <span style={{
                              background: 'var(--secondary-color)',
                              color: 'white',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '14px',
                              fontWeight: 'bold'
                            }}>{index + 1}</span>}
                            <span>👥</span>
                            {team.teamName}
                          </h4>
                          <div style={{
                            background: 'var(--primary-color)',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '18px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>🏆</span>
                            {team.score.toFixed(2)} نقطة
                          </div>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                          <table className="leaderboard-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>المحكم</th>
                                <th>الإجابة</th>
                                <th>النقاط</th>
                                <th>الوقت</th>
                              </tr>
                            </thead>
                            <tbody>
                              {team.answers.map((answer, idx) => (
                                <tr key={answer.id}>
                                  <td>{idx + 1}</td>
                                  <td>{getJudgeName(answer.judge_id, session.judges)}</td>
                                  <td>{answer.answer}</td>
                                  <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                                    {(answer.points || 1).toFixed(2)}
                                  </td>
                                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    {new Date(answer.created_at || '').toLocaleTimeString('ar-SA')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
