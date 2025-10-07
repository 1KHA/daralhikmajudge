import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSessionResults, getAnswersBySession } from '../lib/supabaseService';
import type { SessionResult, Answer } from '../types';

export default function ResultsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [results, setResults] = useState<SessionResult[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      loadSessionData(selectedSession);
    }
  }, [selectedSession]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSessions(data || []);
      
      if (data && data.length > 0) {
        setSelectedSession(data[0].session_id);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      alert('خطأ في تحميل الجلسات');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionData = async (sessionId: string) => {
    try {
      setLoading(true);
      const [resultsData, answersData] = await Promise.all([
        getSessionResults(sessionId),
        getAnswersBySession(sessionId)
      ]);
      
      setResults(resultsData);
      setAnswers(answersData);
    } catch (error) {
      console.error('Error loading session data:', error);
      alert('خطأ في تحميل بيانات الجلسة');
    } finally {
      setLoading(false);
    }
  };

  const calculateTeamScores = () => {
    const teamScores: { [key: string]: number } = {};
    
    answers.forEach(answer => {
      if (!teamScores[answer.team_id]) {
        teamScores[answer.team_id] = 0;
      }
      teamScores[answer.team_id] += 1; // Count each answer as 1 point
    });
    
    return Object.entries(teamScores)
      .map(([teamName, score]) => ({ teamName, score }))
      .sort((a, b) => b.score - a.score);
  };

  const teamScores = calculateTeamScores();
  const selectedSessionData = sessions.find(s => s.session_id === selectedSession);

  return (
    <div className="container">
      <div className="header">
        <h1>النتائج والإحصائيات</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/host')}>
          <span>←</span>
          العودة للوحة التحكم
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <div className="card-icon">📊</div>
            <span>اختر الجلسة</span>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            style={{ width: '100%', padding: '12px', fontSize: '16px' }}
          >
            {sessions.map(session => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id} - {new Date(session.created_at).toLocaleString('ar-SA')}
              </option>
            ))}
          </select>
        </div>

        {selectedSessionData && (
          <div style={{
            background: 'var(--primary-light)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h3 style={{ marginBottom: '8px', color: 'var(--primary-color)' }}>
              معلومات الجلسة
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <strong>معرف الجلسة:</strong> {selectedSessionData.session_id}
              </div>
              <div>
                <strong>عدد الفرق:</strong> {selectedSessionData.teams?.length || 0}
              </div>
              <div>
                <strong>عدد الإجابات:</strong> {answers.length}
              </div>
              <div>
                <strong>التاريخ:</strong> {new Date(selectedSessionData.created_at).toLocaleDateString('ar-SA')}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">جاري التحميل...</div>
        </div>
      ) : (
        <>
          {/* Leaderboard */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon">🏆</div>
                <span>لوحة المتصدرين</span>
              </div>
            </div>
            
            {teamScores.length === 0 ? (
              <div className="empty-state">لا توجد نتائج لهذه الجلسة</div>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>المركز</th>
                    <th>الفريق</th>
                    <th style={{ textAlign: 'left' }}>عدد الإجابات</th>
                  </tr>
                </thead>
                <tbody>
                  {teamScores.map((team, index) => (
                    <tr key={team.teamName}>
                      <td>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'var(--secondary-light)',
                          fontWeight: 'bold',
                          color: index < 3 ? 'white' : 'var(--text-primary)'
                        }}>
                          {index + 1}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{team.teamName}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600, color: 'var(--primary-color)' }}>
                        {team.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Answers Details */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <div className="card-icon">📝</div>
                <span>تفاصيل الإجابات ({answers.length})</span>
              </div>
            </div>
            
            {answers.length === 0 ? (
              <div className="empty-state">لا توجد إجابات لهذه الجلسة</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {answers.map((answer, index) => (
                  <div
                    key={answer.id}
                    style={{
                      background: 'var(--secondary-light)',
                      padding: '16px',
                      borderRadius: '8px',
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: '16px',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{
                      background: 'var(--primary-color)',
                      color: 'white',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}>
                      {index + 1}
                    </div>
                    
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        {answer.team_id}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {answer.answer}
                      </div>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      {new Date(answer.created_at || '').toLocaleTimeString('ar-SA')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
