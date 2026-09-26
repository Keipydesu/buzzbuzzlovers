module MethodReplacement
  # The pinned Minitest has no mock/stub module. Restore every replacement,
  # including whether the method originally came from an ancestor.
  def with_method_replaced(object, name, replacement)
    original = object.method(name)
    own_method = object.singleton_class.instance_methods(false).include?(name)
    object.define_singleton_method(name, &replacement)
    yield
  ensure
    if own_method
      object.define_singleton_method(name, &original)
    else
      object.singleton_class.remove_method(name)
    end
  end
end
