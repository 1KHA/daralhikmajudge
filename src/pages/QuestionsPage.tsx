import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQuestionBanks, getQuestions } from '../lib/supabaseService';
import type { QuestionBank, Question } from '../types';

export default function QuestionsPage() {
  const navigate = useNavigate();
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [banksData, questionsData] = await Promise.all([
        getQuestionBanks(),
        getQuestions()
      ]);
      setQuestionBanks(banksData);
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const filteredQuestions = selectedBank
    ? questions.filter(q => q.bank_id === selectedBank)
    : questions;

  return (
    <div className="container">
      <div className="header">
        <h1>إدارة الأسئلة</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/host')}>
          <span>←</span>
          العودة للوحة التحكم
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <div className="card-icon">📚</div>
            <span>بنوك الأسئلة</span>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="bankFilter">تصفية حسب البنك:</label>
          <select
            id="bankFilter"
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            style={{ width: '100%', padding: '10px', marginTop: '8px' }}
          >
            <option value="">جميع الأسئلة</option>
            {questionBanks.map(bank => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="empty-state">جاري التحميل...</div>
        ) : (
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              الأسئلة ({filteredQuestions.length})
            </h3>
            
            {filteredQuestions.length === 0 ? (
              <div className="empty-state">لا توجد أسئلة</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredQuestions.map((question, index) => (
                  <div
                    key={question.id}
                    style={{
                      background: 'var(--secondary-light)',
                      padding: '20px',
                      borderRadius: '8px',
                      borderRight: '4px solid var(--primary-color)'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '12px'
                    }}>
                      <div style={{
                        background: 'var(--primary-color)',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '14px',
                        fontWeight: 600
                      }}>
                        السؤال {index + 1}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                      }}>
                        {questionBanks.find(b => b.id === question.bank_id)?.name || 'غير محدد'}
                      </div>
                    </div>
                    
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      marginBottom: '12px',
                      color: 'var(--text-primary)'
                    }}>
                      {question.text}
                    </div>
                    
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '8px'
                    }}>
                      {question.choices.map((choice, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 12px',
                            background: 'white',
                            border: '2px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '14px'
                          }}
                        >
                          {choice}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          لإضافة أو تعديل الأسئلة، يرجى استخدام قاعدة البيانات مباشرة
        </p>
      </div>
    </div>
  );
}
