ENV['RAILS_ENV'] = 'test'
require_relative '../config/environment'
require 'rails/test_help'
class DemoTest < ActiveSupport::TestCase
  setup { DemoSession.delete_all }
  def payload(**changes)
    {'snapshot'=>{'protocol_version'=>1,'state'=>'upright','sequence'=>1,'tracked_seconds'=>60,'slouch_seconds'=>10,'episode_count'=>2}.merge(changes.transform_keys(&:to_s)), 'first_observed_at'=>Time.current.iso8601}
  end
  test 'duplicate stale conflict regression and terminal replay' do
    assert_equal 'accepted', DemoSession.ingest(7,payload).first
    assert_equal 'duplicate', DemoSession.ingest(7,payload).first
    assert_raises(DemoSession::Conflict){DemoSession.ingest(7,payload(slouch_seconds:11))}
    assert_raises(DemoSession::Invalid){DemoSession.ingest(7,payload(sequence:2,tracked_seconds:59))}
    assert_equal 'accepted', DemoSession.ingest(7,payload(sequence:3,state:'ended')).first
    assert_equal 'stale', DemoSession.ingest(7,payload).first
    assert_equal 'duplicate', DemoSession.ingest(7,payload(sequence:3,state:'ended')).first
    assert_raises(DemoSession::Conflict){DemoSession.ingest(7,payload(sequence:4))}
    assert_equal 1,DemoSession.count
    assert_equal 60,DemoSession.first.tracked_seconds
  end
  test 'strict validation and unsigned bounds' do
    [1.5,'1',true,nil,0,4294967296].each{|v|assert_raises(DemoSession::Invalid){DemoSession.ingest(7,payload(sequence:v))}}
    assert_raises(DemoSession::Invalid){DemoSession.ingest(0,payload)}
    assert_raises(DemoSession::Invalid){DemoSession.ingest(7,payload(slouch_seconds:61))}
    assert_raises(DemoSession::Invalid){DemoSession.ingest(7,payload.merge('extra'=>1))}
    assert_equal 'accepted',DemoSession.ingest(4294967295,payload(sequence:4294967295)).first
  end
  test 'weighted summaries challenge and empty history' do
    assert_nil DemoSession.dashboard[:today][:non_slouch_percent]
    assert_equal 7,DemoSession.dashboard[:days].length
    DemoSession.ingest(1,payload)
    DemoSession.ingest(2,payload(tracked_seconds:120,slouch_seconds:60))
    assert_equal 61.11,DemoSession.dashboard[:today][:non_slouch_percent]
    assert_equal 0,DemoSession.dashboard[:challenge][:earned_points]
    DemoSession.ingest(3,payload(tracked_seconds:1020))
    assert_equal 50,DemoSession.dashboard[:challenge][:earned_points]
    DemoSession.ingest(3,payload(tracked_seconds:1020))
    assert_equal 50,DemoSession.dashboard[:challenge][:earned_points]
  end
  test 'calendar date stays frozen after midnight retry' do
    p=payload.merge('first_observed_at'=>'2026-01-02T02:00:00Z')
    DemoSession.ingest(1,p)
    DemoSession.ingest(1,payload(sequence:2))
    assert_equal Date.new(2026,1,1),DemoSession.first.calendar_day
  end
end
class DemoRequestTest < ActionDispatch::IntegrationTest
  setup { DemoSession.delete_all }
  test 'dashboard seed reload and reset' do
    get '/';assert_response :success;assert_select 'h1','Find your happy posture.'
    post '/api/demo/seed',params:{},as: :json;assert_response :success
    assert_equal 5,DemoSession.count
    post '/api/demo/seed',params:{},as: :json;assert_equal 5,DemoSession.count
    get '/api/demo';assert_response :success;assert_equal 7,response.parsed_body['days'].size
    delete '/api/demo',params:{},as: :json;assert_response :success;assert_equal 0,DemoSession.count
  end
  test 'malformed and excessive requests' do
    put '/api/demo/sessions/1',params:'{',headers:{'CONTENT_TYPE'=>'application/json'};assert_response :bad_request
    put '/api/demo/sessions/1',params:'x'*8193,headers:{'CONTENT_TYPE'=>'application/json'};assert_response :content_too_large
  end
  test 'csrf is required for mutations' do
    old=ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection=true
    post '/api/demo/seed',params:{},as: :json
    assert_response :unprocessable_entity
  ensure
    ActionController::Base.allow_forgery_protection=old
  end
end
