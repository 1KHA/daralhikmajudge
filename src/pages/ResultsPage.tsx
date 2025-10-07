import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSessionResults, getAnswersBySession, getJudgesBySession } from '../lib/supabaseService';
import type { SessionResult, Answer } from '../types';

export default function ResultsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [results, setResults] = useState<SessionResult[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [judges, setJudges] = useState<any[]>([]);
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
      const [resultsData, answersData, judgesData] = await Promise.all([
        getSessionResults(sessionId),
        getAnswersBySession(sessionId),
        getJudgesBySession(sessionId)
      ]);
      
      setResults(resultsData);
      setAnswers(answersData);
      setJudges(judgesData);
    } catch (error) {
      console.error('Error loading session data:', error);
      alert('خطأ في تحميل بيانات الجلسة');
    } finally {
      setLoading(false);
    }
  };

  // Calculate points based on answer weights
  const calculateAnswerPoints = (answer: Answer) => {
    // For now, each answer gets 1 point
    // You can enhance this with actual weight calculations
    return answer.points || 1;
  };

  const calculateTeamScores = () => {
    const teamScores: { [key: string]: { score: number; answers: Answer[] } } = {};
    
    answers.forEach(answer => {
      if (!teamScores[answer.team_id]) {
        teamScores[answer.team_id] = { score: 0, answers: [] };
      }
      const points = calculateAnswerPoints(answer);
      teamScores[answer.team_id].score += points;
      teamScores[answer.team_id].answers.push(answer);
    });
    
    return Object.entries(teamScores)
      .map(([teamName, data]) => ({ teamName, ...data }))
      .sort((a, b) => b.score - a.score);
  };

  const teamScores = calculateTeamScores();
  const selectedSessionData = sessions.find(s => s.session_id === selectedSession);
  const maxScore = teamScores.length > 0 ? teamScores[0].score : 0;
  const avgScore = teamScores.length > 0 
    ? teamScores.reduce((sum, t) => sum + t.score, 0) / teamScores.length 
    : 0;

  const getJudgeName = (judgeId: string) => {
    const judge = judges.find(j => j.id === judgeId);
    return judge ? judge.name : judgeId;
  };

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
            <h3 style={{ marginBottom: '12px', color: 'var(--primary-color)' }}>
              معلومات الجلسة
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div className="stat-card">
                <div className="stat-value">{selectedSessionData.teams?.length || 0}</div>
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
                <div className="stat-value">{answers.length}</div>
                <div className="stat-label">عدد الإجابات</div>
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
              <div className="empty-state">
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
                <h3>لا توجد نتائج لهذه الجلسة</h3>
                <p>لم يتم تسجيل أي إجابات بعد</p>
              </div>
            ) : (
              <div>
                {teamScores.map((team, index) => (
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
                      <h3 style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {index === 0 && '🥇'}
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
                      </h3>
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
                              <td>{getJudgeName(answer.judge_id)}</td>
                              <td>{answer.answer}</td>
                              <td style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                                {calculateAnswerPoints(answer).toFixed(2)}
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
        </>
      )}
    </div>
  );
}
