import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  getTeams,
  getQuestionBanks,
  getQuestions,
  createSession,
  updateSession,
  getJudgesBySession,
  getAnswersBySession,
  upsertSessionResult
} from '../lib/supabaseService';
import type { Team, Question, QuestionBank, Judge, Answer, LeaderboardEntry, AnswersByTeam } from '../types';

export default function HostPage() {
  const [sessionId, setSessionId] = useState<string>('لم تبدأ');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [currentTeam, setCurrentTeam] = useState<string>('لا يوجد');
  const [currentTeamIndex, setCurrentTeamIndex] = useState<number>(0);
  
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  
  const [judges, setJudges] = useState<Judge[]>([]);
  const [answers, setAnswers] = useState<AnswersByTeam>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Load initial data
  useEffect(() => {
    loadInitialData();
    checkExistingSession();
  }, []);

  const loadInitialData = async () => {
    try {
      const [teamsData, banksData, questionsData] = await Promise.all([
        getTeams(),
        getQuestionBanks(),
        getQuestions()
      ]);
      
      setTeams(teamsData);
      setQuestionBanks(banksData);
      setAllQuestions(questionsData);
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading initial data:', error);
      alert('خطأ في تحميل البيانات');
    }
  };

  const checkExistingSession = async () => {
    const savedSessionId = localStorage.getItem('hostSessionId');
    const savedHostToken = localStorage.getItem('hostToken');
    
    if (savedSessionId && savedHostToken) {
      setSessionId(savedSessionId);
      subscribeToSession(savedSessionId);
      // Load initial judges
      await loadJudges(savedSessionId);
    }
  };

  const subscribeToSession = (sessionId: string) => {
    console.log('Setting up real-time subscriptions for session:', sessionId);
    
    // Subscribe to judges changes
    const judgesChannel = supabase
      .channel(`judges-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'judges', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          console.log('Judge change detected:', payload);
          loadJudges(sessionId);
        }
      )
      .subscribe((status) => {
        console.log('Judges channel status:', status);
      });

    // Subscribe to answers changes
    const answersChannel = supabase
      .channel(`answers-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          console.log('Answer change detected:', payload);
          loadAnswers(sessionId);
        }
      )
      .subscribe((status) => {
        console.log('Answers channel status:', status);
      });

    // Subscribe to results changes
    const resultsChannel = supabase
      .channel(`results-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_results', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          console.log('Results change detected:', payload);
          loadLeaderboard(sessionId);
        }
      )
      .subscribe((status) => {
        console.log('Results channel status:', status);
      });

    return () => {
      console.log('Cleaning up real-time subscriptions');
      judgesChannel.unsubscribe();
      answersChannel.unsubscribe();
      resultsChannel.unsubscribe();
    };
  };

  const loadJudges = async (sessionId: string) => {
    try {
      const judgesData = await getJudgesBySession(sessionId);
      setJudges(judgesData);
    } catch (error) {
      console.error('Error loading judges:', error);
    }
  };

  const loadAnswers = async (sessionId: string) => {
    try {
      const answersData = await getAnswersBySession(sessionId);
      const judgesData = await getJudgesBySession(sessionId);
      
      // Create a map of judge IDs to names
      const judgeMap = new Map(judgesData.map(judge => [judge.id, judge.name]));
      
      // Group answers by team
      const grouped: AnswersByTeam = {};
      answersData.forEach(answer => {
        const teamName = answer.team_id;
        if (!grouped[teamName]) {
          grouped[teamName] = [];
        }
        grouped[teamName].push({
          player: judgeMap.get(answer.judge_id) || answer.judge_id, // Use judge name or fallback to ID
          answer: answer.answer
        });
      });
      setAnswers(grouped);
      
      console.log('Answers loaded and grouped:', grouped);
      
      // Also update leaderboard when answers change
      await loadLeaderboard(sessionId);
    } catch (error) {
      console.error('Error loading answers:', error);
    }
  };

  const loadLeaderboard = async (sessionId: string) => {
    try {
      // Always calculate from real-time answers for live sessions
      // This ensures we show weighted points as they come in
      await calculateLeaderboardFromAnswers(sessionId);
      
      console.log('Leaderboard loaded from real-time answers');
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  const calculateLeaderboardFromAnswers = async (sessionId: string) => {
    try {
      const answersData = await getAnswersBySession(sessionId);
      
      // Calculate weighted scores per team using answer.points
      const teamScores: { [key: string]: number } = {};
      answersData.forEach(answer => {
        const teamName = answer.team_id;
        if (!teamScores[teamName]) {
          teamScores[teamName] = 0;
        }
        // Use the weighted points from the answer (calculated by judge page)
        teamScores[teamName] += (answer.points || 1);
      });
      
      // Convert to leaderboard format and sort
      const leaderboardData = Object.entries(teamScores)
        .map(([teamName, totalPoints]) => ({
          teamName,
          totalPoints
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints);
      
      setLeaderboard(leaderboardData);
      console.log('Real-time leaderboard calculated with weighted points:', leaderboardData);
    } catch (error) {
      console.error('Error calculating leaderboard:', error);
    }
  };

  const handleSetTeams = async () => {
    if (selectedTeams.length === 0) {
      alert('يرجى اختيار فريق واحد على الأقل');
      return;
    }

    try {
      const newSessionId = crypto.randomUUID().substring(0, 8);
      const newHostToken = crypto.randomUUID();
      
      const session = await createSession({
        name: `Session ${new Date().toISOString()}`,
        session_id: newSessionId,
        host_token: newHostToken,
        teams: selectedTeams,
        total_points: 100
      });

      setSessionId(session.session_id);
      setCurrentTeam(selectedTeams[0]);
      setCurrentTeamIndex(0);

      localStorage.setItem('hostSessionId', session.session_id);
      localStorage.setItem('hostToken', newHostToken);

      subscribeToSession(session.session_id);
      await loadJudges(session.session_id);
      alert(`تم إنشاء الجلسة: ${session.session_id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('خطأ في إنشاء الجلسة');
    }
  };

  const handlePreviousTeam = async () => {
    if (selectedTeams.length === 0) return;
    
    const newIndex = currentTeamIndex > 0 ? currentTeamIndex - 1 : selectedTeams.length - 1;
    setCurrentTeamIndex(newIndex);
    setCurrentTeam(selectedTeams[newIndex]);

    if (sessionId !== 'لم تبدأ') {
      await updateSession(sessionId, {
        current_team_index: newIndex,
        current_team_id: selectedTeams[newIndex]
      });
    }
  };

  const handleNextTeam = async () => {
    if (selectedTeams.length === 0) return;
    
    const newIndex = currentTeamIndex < selectedTeams.length - 1 ? currentTeamIndex + 1 : 0;
    setCurrentTeamIndex(newIndex);
    setCurrentTeam(selectedTeams[newIndex]);

    if (sessionId !== 'لم تبدأ') {
      await updateSession(sessionId, {
        current_team_index: newIndex,
        current_team_id: selectedTeams[newIndex]
      });
    }
  };

  const handleEndSession = async () => {
    if (sessionId === 'لم تبدأ') return;
    
    if (!confirm('هل أنت متأكد من إنهاء الجلسة؟ سيتم حفظ النتائج النهائية.')) return;

    try {
      // Calculate and save final results for all teams
      const answersData = await getAnswersBySession(sessionId);
      
      // Group answers by team and calculate scores
      const teamScores: { [key: string]: { answers: Answer[], totalPoints: number } } = {};
      answersData.forEach(answer => {
        if (!teamScores[answer.team_id]) {
          teamScores[answer.team_id] = { answers: [], totalPoints: 0 };
        }
        teamScores[answer.team_id].answers.push(answer);
        teamScores[answer.team_id].totalPoints += (answer.points || 1);
      });
      
      // Save results for each team
      const savePromises = Object.entries(teamScores).map(([teamId, data]) => {
        return upsertSessionResult({
          session_id: sessionId,
          team_id: teamId,
          total_points: data.totalPoints,
          details: {
            answers: data.answers.map(a => ({
              questionId: a.question_id,
              answer: a.answer,
              points: a.points || 1,
              judgeId: a.judge_id,
              timestamp: a.created_at
            }))
          }
        });
      });
      
      await Promise.all(savePromises);
      console.log('✅ Session results saved successfully');
      
      // Mark session as completed (update with end time)
      await updateSession(sessionId, {
        current_team_id: 'completed'
      });
      
      // Clear local state but DON'T delete from database
      localStorage.removeItem('hostSessionId');
      localStorage.removeItem('hostToken');
      
      setSessionId('لم تبدأ');
      setCurrentTeam('لا يوجد');
      setSelectedTeams([]);
      setJudges([]);
      setAnswers({});
      setLeaderboard([]);
      
      alert(`تم إنهاء الجلسة وحفظ النتائج بنجاح!\nعدد الفرق: ${Object.keys(teamScores).length}\nإجمالي الإجابات: ${answersData.length}`);
    } catch (error) {
      console.error('Error ending session:', error);
      alert('خطأ في إنهاء الجلسة: ' + (error as Error).message);
    }
  };

  const handleBankChange = async (bankId: string) => {
    setSelectedBank(bankId);
    
    if (bankId) {
      const bankQuestions = allQuestions.filter(q => q.bank_id === bankId);
      setQuestions(bankQuestions);
    } else {
      setQuestions(allQuestions);
    }
  };

  const handleSendQuestions = async () => {
    if (selectedQuestions.length === 0) {
      alert('يرجى اختيار سؤال واحد على الأقل');
      return;
    }

    if (sessionId === 'لم تبدأ') {
      alert('يرجى إنشاء جلسة أولاً');
      return;
    }

    try {
      const questionsToSend = questions.filter(q => selectedQuestions.includes(q.id));
      
      await updateSession(sessionId, {
        current_questions: questionsToSend
      });

      // Broadcast to judges via Supabase Realtime
      const channel = supabase.channel(`session-${sessionId}`, {
        config: {
          broadcast: { self: true }
        }
      });
      
      // Subscribe first, then send
      await new Promise((resolve) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve(true);
          }
        });
      });

      await channel.send({
        type: 'broadcast',
        event: 'new-questions',
        payload: {
          questions: questionsToSend,
          currentTeam: currentTeam,
          teamId: currentTeam
        }
      });

      console.log('Questions broadcasted successfully');
      alert('تم إرسال الأسئلة بنجاح');
      
      // Unsubscribe after sending
      setTimeout(() => {
        channel.unsubscribe();
      }, 1000);
    } catch (error) {
      console.error('Error sending questions:', error);
      alert('خطأ في إرسال الأسئلة');
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>إدارة التحكيم</h1>
        <div className="session-badge">
          <span>معرف الجلسة:</span>
          <span>{sessionId}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Teams Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">👥</div>
              <span>إدارة الفرق</span>
            </div>
          </div>
          <div>
            <label htmlFor="teamSelect">اختر الفرق المشاركة:</label>
            <select
              id="teamSelect"
              multiple
              value={selectedTeams}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setSelectedTeams(selected);
              }}
            >
              {teams.map(team => (
                <option key={team.id} value={team.name}>
                  {team.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleSetTeams} style={{ width: '100%', marginTop: '12px' }}>
              <span>✓</span>
              تعيين الفرق المحددة
            </button>
          </div>
          
          <div className="team-display">
            <h3>الفريق الحالي</h3>
            <div className="team-name">{currentTeam}</div>
          </div>
          
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={handlePreviousTeam}>
              <span>◀</span>
              السابق
            </button>
            <button className="btn btn-secondary" onClick={handleNextTeam}>
              <span>▶</span>
              التالي
            </button>
            <button className="btn btn-danger" onClick={handleEndSession}>
              <span>✕</span>
              إنهاء
            </button>
          </div>
        </div>

        {/* Questions Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">❓</div>
              <span>الأسئلة</span>
            </div>
          </div>
          <div>
            <label htmlFor="bankSelect">بنك الأسئلة:</label>
            <select
              id="bankSelect"
              value={selectedBank}
              onChange={(e) => handleBankChange(e.target.value)}
            >
              <option value="">جميع الأسئلة</option>
              {questionBanks.map(bank => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
            
            <label htmlFor="questionSelect" style={{ marginTop: '12px' }}>اختر الأسئلة:</label>
            <select
              id="questionSelect"
              multiple
              value={selectedQuestions}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setSelectedQuestions(selected);
              }}
            >
              {questions.map(question => (
                <option key={question.id} value={question.id}>
                  {question.text}
                </option>
              ))}
            </select>
            
            <button className="btn btn-success" onClick={handleSendQuestions} style={{ width: '100%', marginTop: '12px' }}>
              <span>📤</span>
              إرسال الأسئلة المحددة
            </button>
          </div>
        </div>

        {/* Judges Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">⚖️</div>
              <span>المحكمون المتصلون</span>
            </div>
          </div>
          <ul className="judge-list">
            {judges.length === 0 ? (
              <li className="empty-state">لا يوجد محكمون متصلون</li>
            ) : (
              judges.map(judge => (
                <li key={judge.id}>{judge.name}</li>
              ))
            )}
          </ul>
        </div>

        {/* Answers Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">📝</div>
              <span>الإجابات</span>
            </div>
          </div>
          <div className="answers-container">
            {Object.keys(answers).length === 0 ? (
              <div className="empty-state">لم يتم استلام إجابات بعد</div>
            ) : (
              Object.entries(answers).map(([team, teamAnswers]) => (
                <div key={team} className="answer-item">
                  <strong>{team}</strong>
                  <ul>
                    {teamAnswers.map((answer, idx) => (
                      <li key={idx}>{answer.player}: {answer.answer}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Leaderboard Card */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <div className="card-title">
              <div className="card-icon">🏆</div>
              <span>لوحة المتصدرين</span>
            </div>
          </div>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>الفريق</th>
                <th style={{ textAlign: 'left' }}>إجمالي النقاط</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={2} className="empty-state">لا توجد نتائج بعد</td>
                </tr>
              ) : (
                leaderboard.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{entry.teamName}</td>
                    <td style={{ textAlign: 'left', fontWeight: 600, color: 'var(--primary-color)' }}>
                      {entry.totalPoints.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>الإجراءات السريعة</h3>
        <div className="action-links">
          <a href="/questions" className="btn btn-success">
            <span>➕</span>
            إضافة/تعديل الأسئلة
          </a>
          <a href="/results" className="btn btn-primary">
            <span>📊</span>
            عرض النتائج
          </a>
        </div>
      </div>
    </div>
  );
}
